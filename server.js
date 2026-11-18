import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { store } from './lib/store.js';
import {
  clearOauthState,
  clearSession,
  getSession,
  setOauthState,
  setSession,
  checkOauthState,
} from './lib/session.js';
import {
  authorizationUrl,
  checkAccess,
  exchangeCode,
  fetchUser,
  isAdmin,
} from './lib/discord.js';
import { notifyOrder } from './lib/notify.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const DEMO_USER = {
  uid: 'demo-user',
  username: 'ضيف تجريبي',
  avatar: '',
  hasShopRole: true,
  isAdmin: true,
  demo: true,
};

function requireAuth(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
  next();
}

function requireShopRole(req, res, next) {
  if (!req.session?.hasShopRole) {
    return res.status(403).json({ error: 'لا تملك صلاحية الدخول إلى المتجر.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(403).json({ error: 'هذه العملية مقتصرة على الإدارة.' });
  }
  next();
}

function publicUser(session) {
  if (!session) return null;
  const { uid, username, avatar, hasShopRole, isAdmin, demo } = session;
  return { uid, username, avatar, hasShopRole, isAdmin, demo };
}

app.use((req, _res, next) => {
  req.session = getSession(req);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/config', (_req, res) => {
  res.json({
    brand: config.brand,
    demoMode: config.demoMode,
    previewMode: config.previewMode,
    shopRoleName: config.discord.shopRoleName,
    inviteUrl: config.discord.inviteUrl,
  });
});

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.session) }));

app.get('/api/products', (_req, res) => {
  res.json({
    products: store.products()
      .filter((product) => product.active)
      .map(({ id, name, description, category, image, imageFit, imagePosX, imagePosY, imageZoom, price, stock }) => ({
        id, name, description, category, image,
        imageFit: imageFit || 'cover',
        imagePosX: Number.isFinite(imagePosX) ? imagePosX : 50,
        imagePosY: Number.isFinite(imagePosY) ? imagePosY : 50,
        imageZoom: Number.isFinite(imageZoom) ? imageZoom : 1,
        price, stock,
      })),
  });
});

app.get('/api/orders', requireAuth, (req, res) => {
  const orders = req.session.isAdmin
    ? store.orders()
    : store.orders().filter((order) => order.userId === req.session.uid);
  res.json({ orders });
});

app.post('/api/orders', requireAuth, requireShopRole, async (req, res) => {
  const product = store.product(String(req.body.productId || ''));
  if (!product || !product.active) {
    return res.status(404).json({ error: 'المنتج غير موجود.' });
  }
  const quantity = Math.floor(Number(req.body.quantity));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'الكمية غير صحيحة.' });
  }
  if (quantity > product.stock) {
    return res.status(409).json({ error: 'الكمية المتوفرة غير كافية.' });
  }
  const order = store.addOrder({ product, quantity, user: req.session });
  try {
    await notifyOrder(order);
  } catch (error) {
    console.error('تنبيه ديسكورد:', error.message);
  }
  res.status(201).json({ order });
});

app.patch('/api/orders/:id', requireAuth, requireAdmin, (req, res) => {
  const order = store.updateOrderStatus(req.params.id, req.body.status);
  if (!order) return res.status(400).json({ error: 'أمر أو حالة غير صحيحة.' });
  res.json({ order });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  const products = store.products();
  const orders = store.orders();
  const activeRevenue = orders
    .filter((order) => order.status !== 'ملغي')
    .reduce((sum, order) => sum + order.total, 0);
  res.json({
    stats: {
      members: store.users().length,
      orders: orders.length,
      revenue: Math.round(activeRevenue * 100) / 100,
      products: products.filter((product) => product.active).length,
      pending: orders.filter((order) => order.status === 'قيد الانتظار').length,
    },
    members: store.users().map(({ id, username, firstSeen, lastSeen }) => ({
      id, username, firstSeen, lastSeen,
    })),
    activity: store.activity(),
  });
});

app.get('/api/admin/products', requireAuth, requireAdmin, (_req, res) => {
  res.json({ products: store.products() });
});

app.post('/api/admin/products', requireAuth, requireAdmin, (req, res) => {
  if (!String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب.' });
  }
  res.status(201).json({ product: store.addProduct(req.body) });
});

app.put('/api/admin/products/:id', requireAuth, requireAdmin, (req, res) => {
  if (!String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب.' });
  }
  const product = store.updateProduct(req.params.id, req.body);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود.' });
  res.json({ product });
});

app.delete('/api/admin/products/:id', requireAuth, requireAdmin, (req, res) => {
  if (!store.deleteProduct(req.params.id)) {
    return res.status(404).json({ error: 'المنتج غير موجود.' });
  }
  res.json({ ok: true });
});

app.get('/auth/discord', (req, res) => {
  if (config.demoMode) {
    const payload = setSession(res, DEMO_USER);
    store.touchUser(payload);
    return res.redirect('/#/admin');
  }
  const state = setOauthState(res);
  res.redirect(authorizationUrl(state));
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    if (!checkOauthState(req, String(req.query.state || ''))) {
      throw new Error('انتهت صلاحية طلب الدخول. حاول مرة أخرى.');
    }
    clearOauthState(res);
    if (!req.query.code) throw new Error('لم يتم إرجاع رمز الدخول من ديسكورد.');

    const { access_token: token } = await exchangeCode(String(req.query.code));
    const discordUser = await fetchUser(token);
    const access = await checkAccess(token, discordUser);
    const admin = isAdmin(discordUser.id) || access.adminByRole === true;
    const hasAccess = access.hasShopRole || admin;

    const payload = setSession(res, {
      uid: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
        : '',
      hasShopRole: hasAccess,
      isAdmin: admin,
    });
    store.touchUser(payload);
    if (!hasAccess) return res.redirect('/#/denied');
    res.redirect(admin ? '/#/admin' : '/#/shop');
  } catch (error) {
    console.error('OAuth error:', error.message);
    res.redirect(`/#/error?message=${encodeURIComponent(error.message)}`);
  }
});

app.get('/auth/preview', (req, res) => {
  if (!config.previewMode) {
    return res.status(404).send('المعاينة معطّلة. فعّل PREVIEW_MODE=true محلياً فقط.');
  }
  const role = String(req.query.as || 'member');
  const users = {
    member: { uid: 'preview-member', username: 'عضو القانق', hasShopRole: true, isAdmin: false },
    admin: { uid: 'preview-admin', username: 'الأدمن (معاينة)', hasShopRole: true, isAdmin: true },
    denied: { uid: 'preview-denied', username: 'عضو بلا رول', hasShopRole: false, isAdmin: false },
  };
  const user = users[role] || users.member;
  setSession(res, { ...user, demo: true });
  res.redirect(role === 'denied' ? '/#/denied' : role === 'admin' ? '/#/admin' : '/#/shop');
});

app.get('/auth/logout', (req, res) => {
  clearSession(res);
  res.redirect('/');
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/auth/')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'حدث خطأ غير متوقع.' });
});

app.listen(config.port, () => {
  console.log(`CORTEZ SHOP → ${config.baseUrl}`);
  console.log(config.demoMode ? '⚠ وضع تجريبي مفعّل' : '✓ تسجيل الدخول عبر ديسكورد مفعّل');
});
