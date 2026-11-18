import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = path.resolve('data');
const dataFile = path.join(dataDir, 'store.json');

const empty = () => ({ products: [], orders: [], users: [], activity: [] });

const seedFile = path.join(dataDir, 'seed.json');

function normalize(parsed) {
  return {
    products: Array.isArray(parsed.products) ? parsed.products : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    activity: Array.isArray(parsed.activity) ? parsed.activity : [],
  };
}

function load() {
  try {
    return normalize(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
  } catch {
    try {
      return normalize(JSON.parse(fs.readFileSync(seedFile, 'utf8')));
    } catch {
      return empty();
    }
  }
}

let db = load();

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(temp, dataFile);
}

const cleanText = (value, max = 300) =>
  String(value ?? '').trim().slice(0, max);

const cleanNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function productInput(body) {
  return {
    name: cleanText(body.name, 120),
    description: cleanText(body.description, 600),
    category: cleanText(body.category, 60) || 'عام',
    image: cleanText(body.image, 2000),
    imageFit: body.imageFit === 'contain' ? 'contain' : 'cover',
    imagePosX: Math.min(100, Math.max(0, cleanNumber(body.imagePosX, 50))),
    imagePosY: Math.min(100, Math.max(0, cleanNumber(body.imagePosY, 50))),
    imageZoom: Math.min(3, Math.max(1, cleanNumber(body.imageZoom, 1))),
    price: Math.max(0, Math.round(cleanNumber(body.price) * 100) / 100),
    stock: Math.max(0, Math.floor(cleanNumber(body.stock))),
    active: body.active !== false && String(body.active) !== 'false',
  };
}

export const store = {
  products: () => db.products,
  orders: () => db.orders,
  users: () => db.users,
  activity: () => db.activity,
  order: (id) => db.orders.find((order) => order.id === id),
  product: (id) => db.products.find((product) => product.id === id),

  logActivity(type, text, user = '') {
    db.activity.unshift({
      id: randomUUID(),
      type,
      text,
      user: String(user),
      createdAt: new Date().toISOString(),
    });
    db.activity = db.activity.slice(0, 100);
  },

  addProduct(body) {
    const product = {
      id: randomUUID(),
      ...productInput(body),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.products.unshift(product);
    store.logActivity('product', `أُضيف منتج: ${product.name}`);
    persist();
    return product;
  },

  updateProduct(id, body) {
    const product = store.product(id);
    if (!product) return null;
    Object.assign(product, productInput({ ...product, ...body }), {
      updatedAt: new Date().toISOString(),
    });
    store.logActivity('product', `حُدّث منتج: ${product.name}`);
    persist();
    return product;
  },

  deleteProduct(id) {
    const index = db.products.findIndex((product) => product.id === id);
    if (index === -1) return false;
    const [removed] = db.products.splice(index, 1);
    store.logActivity('product', `حُذف منتج: ${removed.name}`);
    persist();
    return true;
  },

  addOrder({ product, quantity, user }) {
    const order = {
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      total: Math.round(product.price * quantity * 100) / 100,
      status: 'قيد الانتظار',
      userId: user.uid,
      username: user.username,
      createdAt: new Date().toISOString(),
    };
    product.stock -= quantity;
    product.updatedAt = new Date().toISOString();
    db.orders.unshift(order);
    store.logActivity('order', `طلب جديد: ${product.name} × ${quantity}`, user.username);
    persist();
    return order;
  },

  updateOrderStatus(id, status) {
    const order = store.order(id);
    const allowed = ['قيد الانتظار', 'مكتمل', 'ملغي'];
    if (!order || !allowed.includes(status)) return null;
    if (status === 'ملغي' && order.status !== 'ملغي') {
      const product = store.product(order.productId);
      if (product) product.stock += order.quantity;
    } else if (order.status === 'ملغي' && status !== 'ملغي') {
      const product = store.product(order.productId);
      if (product) product.stock = Math.max(0, product.stock - order.quantity);
    }
    order.status = status;
    store.logActivity('order', `حالة الطلب: ${order.status} — ${order.productName}`, order.username);
    persist();
    return order;
  },

  touchUser(user) {
    let existing = db.users.find((item) => item.id === user.uid);
    if (!existing) {
      existing = { id: user.uid, firstSeen: new Date().toISOString() };
      db.users.unshift(existing);
    }
    existing.username = user.username;
    existing.lastSeen = new Date().toISOString();
    store.logActivity('auth', 'دخول إلى المنصة', user.username);
    persist();
  },
};
