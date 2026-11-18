const $ = (id) => document.getElementById(id);

const state = {
  config: null,
  me: null,
  products: [],
  adminProducts: [],
  orders: [],
  category: 'الكل',
  search: '',
  selectedProduct: null,
};

const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

const money = (value) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const dateOf = (iso) => {
  try { return new Date(iso).toLocaleString('en-GB'); } catch { return '—'; }
};

const categoryIcon = (category = '') => {
  const name = category.toLowerCase();
  if (name.includes('سلاح') || name.includes('أسلحة')) return '⌖';
  if (name.includes('ذهب') || name.includes('فلوس') || name.includes('مال')) return '◆';
  if (name.includes('مركب') || name.includes('سيار')) return '◈';
  if (name.includes('أوسمة') || name.includes('وسام')) return '✦';
  return '⬡';
};

const statusClass = (status) =>
  status === 'مكتمل' ? 'status--done' : status === 'ملغي' ? 'status--cancelled' : '';

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'حدث خطأ غير متوقع.');
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const element = $('toast');
  element.textContent = message;
  element.classList.toggle('toast--error', isError);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3500);
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `view-${name}`;
  });
  document.querySelectorAll('.nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === name);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderUser() {
  const area = $('userArea');
  const nav = $('nav');
  if (!state.me) {
    nav.hidden = true;
    area.innerHTML = '<a class="btn btn--ghost" href="/auth/discord">دخول ديسكورد</a>';
    return;
  }
  nav.hidden = !state.me.hasShopRole;
  $('adminLink').hidden = !state.me.isAdmin;
  $('ordersLink').textContent = state.me.isAdmin ? 'طلبات القانق' : 'طلباتي';
  const avatar = state.me.avatar
    ? `<img class="avatar" src="${esc(state.me.avatar)}" alt="">`
    : `<span class="avatar avatar--fallback">${esc(state.me.username.slice(0, 1))}</span>`;
  const badge = state.me.isAdmin ? '<span class="root-badge">ROOT</span>' : '';
  area.innerHTML = `${avatar}<span class="user-name">${esc(state.me.username)}</span>${badge}
    <a class="logout" href="/auth/logout">خروج</a>`;
}

async function loadProducts() {
  const { products } = await api('/api/products');
  state.products = products;
  renderCategories();
  renderProducts();
}

function renderCategories() {
  const categories = ['الكل', ...new Set(state.products.map((product) => product.category || 'عام'))];
  state.category = categories.includes(state.category) ? state.category : 'الكل';
  $('categoryChips').innerHTML = categories
    .map((category) => `<button class="chip ${category === state.category ? 'active' : ''}" data-category="${esc(category)}">${esc(category)}</button>`)
    .join('');
}

function renderProducts() {
  const query = state.search.trim().toLowerCase();
  const products = state.products.filter((product) => {
    const inCategory = state.category === 'الكل' || product.category === state.category;
    const inSearch = !query ||
      product.name.toLowerCase().includes(query) ||
      (product.description || '').toLowerCase().includes(query);
    return inCategory && inSearch;
  });

  $('shopEmpty').hidden = products.length > 0;
  $('productsGrid').innerHTML = products.map((product) => {
    const low = product.stock <= 3;
    const media = product.image
      ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">`
      : `<span>${categoryIcon(product.category)}</span>`;
    return `<article class="product">
      <div class="product__media">${media}</div>
      <div class="product__body">
        <span class="product__category">${esc(product.category || 'عام')}</span>
        <h3>${esc(product.name)}</h3>
        <p class="product__desc">${esc(product.description || 'لا يوجد وصف.')}</p>
        <div class="product__foot">
          <div>
            <div class="price">${money(product.price)} <small>وحدة</small></div>
            <div class="stock ${low ? 'stock--low' : ''}">المتوفر: ${product.stock}</div>
          </div>
          <button class="btn btn--primary" data-buy="${esc(product.id)}" ${product.stock < 1 ? 'disabled' : ''}>اطلب الآن</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

async function loadOrders() {
  const { orders } = await api('/api/orders');
  state.orders = orders;
  $('ordersEmpty').hidden = orders.length > 0;
  $('ordersBody').innerHTML = orders.map((order) => `<tr>
    ${state.me?.isAdmin ? `<td>${esc(order.username)}</td>` : ''}
    <td>${esc(order.productName)}</td>
    <td>${order.quantity}</td>
    <td>${money(order.unitPrice)}</td>
    <td><strong>${money(order.total)}</strong></td>
    <td><span class="status ${statusClass(order.status)}">${esc(order.status)}</span></td>
    <td>${dateOf(order.createdAt)}</td>
  </tr>`).join('');
}

function renderConsole({ stats, activity, members, orders }) {
  const cards = [
    { label: 'الأعضاء داخل السيت', value: stats.members, className: '' },
    { label: 'إجمالي الطلبات', value: stats.orders, className: '' },
    { label: 'إجمالي المبيعات', value: money(stats.revenue), className: 'stat--revenue' },
    { label: 'منتجات متاحة', value: stats.products, className: '' },
    { label: 'طلبات قيد الانتظار', value: stats.pending, className: 'stat--pending' },
  ];
  $('adminStats').innerHTML = cards.map((card) => `<div class="stat ${card.className}">
    <span class="stat__label">${card.label}</span>
    <span class="stat__value">${card.value}</span>
  </div>`).join('');

  const lines = activity.map((item) => {
    const time = new Date(item.createdAt).toLocaleTimeString('en-GB');
    const tag = item.type === 'auth' ? '[AUTH]' : item.type === 'order' ? '[ORDER]' : '[SHOP]';
    return `${time}  ${tag}  ${item.text}${item.user ? `  —  ${item.user}` : ''}`;
  });
  $('activityLog').textContent = lines.length
    ? lines.join('\n')
    : 'لا توجد أحداث مسجلة بعد.';
  $('consoleClock').textContent = new Date().toLocaleTimeString('en-GB');

  $('membersList').innerHTML = members.length
    ? members.map((member) => {
        const count = orders.filter((order) => order.userId === member.id).length;
        return `<div class="member">
          <span class="member__avatar">${esc(member.username.slice(0, 1))}</span>
          <div>
            <div class="member__name">${esc(member.username)}</div>
            <div class="member__meta">${count} طلب • آخر دخول ${dateOf(member.lastSeen)}</div>
          </div>
        </div>`;
      }).join('')
    : '<p class="muted">لا يوجد أعضاء مسجلون بعد.</p>';
}

async function loadAdmin() {
  const [{ products }, { orders }, overview] = await Promise.all([
    api('/api/admin/products'),
    api('/api/orders'),
    api('/api/admin/overview'),
  ]);
  renderConsole({ ...overview, orders });
  state.adminProducts = products;
  $('adminProductsEmpty').hidden = products.length > 0;
  $('adminProducts').innerHTML = products.map((product) => `<div class="admin-item">
    <div class="admin-item__head">
      <strong>${esc(product.name)}</strong>
      <div>
        <button class="btn btn--danger" data-delete="${esc(product.id)}">حذف</button>
      </div>
    </div>
    <div class="admin-item__edit">
      <label>السعر<input type="number" min="0" step="0.01" value="${product.price}" data-price="${esc(product.id)}"></label>
      <label>الكمية<input type="number" min="0" step="1" value="${product.stock}" data-stock="${esc(product.id)}"></label>
      <button class="mini-btn" data-quicksave="${esc(product.id)}">حفظ</button>
      <button class="mini-btn" data-edit="${esc(product.id)}">تعديل</button>
    </div>
  </div>`).join('');

  $('adminOrdersBody').innerHTML = orders.map((order) => `<tr>
    <td>${esc(order.username)}</td>
    <td>${esc(order.productName)}</td>
    <td>${order.quantity}</td>
    <td>${money(order.total)}</td>
    <td>
      <select data-status="${esc(order.id)}">
        ${['قيد الانتظار', 'مكتمل', 'ملغي'].map((s) => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </td>
  </tr>`).join('');
}

function resetForm() {
  $('productId').value = '';
  $('productForm').reset();
  $('fieldActive').checked = true;
  $('formTitle').textContent = 'إضافة منتج جديد';
  $('saveProductBtn').textContent = 'حفظ المنتج';
  $('resetFormBtn').hidden = true;
}

function fillForm(product) {
  $('productId').value = product.id;
  $('fieldName').value = product.name;
  $('fieldDescription').value = product.description || '';
  $('fieldPrice').value = product.price;
  $('fieldStock').value = product.stock;
  $('fieldCategory').value = product.category || '';
  $('fieldImage').value = product.image || '';
  $('fieldActive').checked = product.active;
  $('formTitle').textContent = `تعديل: ${product.name}`;
  $('saveProductBtn').textContent = 'حفظ التعديلات';
  $('resetFormBtn').hidden = false;
  $('productForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function formBody() {
  return {
    name: $('fieldName').value,
    description: $('fieldDescription').value,
    price: $('fieldPrice').value,
    stock: $('fieldStock').value,
    category: $('fieldCategory').value,
    image: $('fieldImage').value,
    active: $('fieldActive').checked,
  };
}

function openBuyModal(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  state.selectedProduct = product;
  $('buyTitle').textContent = product.name;
  $('buyDescription').textContent = product.description || '';
  $('buyStock').textContent = product.stock;
  $('buyPrice').textContent = money(product.price);
  $('buyQuantity').max = product.stock;
  $('buyQuantity').value = 1;
  updateBuyTotal();
  $('buyModal').hidden = false;
}

function updateBuyTotal() {
  if (!state.selectedProduct) return;
  const quantity = Math.max(1, Number($('buyQuantity').value) || 1);
  $('buyTotal').textContent = money(state.selectedProduct.price * quantity);
}

async function route() {
  const hash = location.hash || '#/';
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const name = hash.slice(2).split('?')[0];

  if (name === 'error') {
    $('errorMessage').textContent = params.get('message') || 'خطأ غير معروف.';
    return showView('error');
  }
  if (name === 'denied' || (state.me && !state.me.hasShopRole)) {
    $('deniedMessage').textContent = state.me
      ? `لا تملك رول «${state.config.shopRoleName}» في سيرفر العائلة.`
      : 'يجب تسجيل الدخول عبر ديسكورد أولاً.';
    return showView('denied');
  }
  if (!state.me) return showView('home');

  if (name === 'orders') {
    const isAdmin = state.me.isAdmin;
    $('ordersTitle').textContent = isAdmin ? 'طلبات القانق' : 'طلباتي';
    $('ordersEyebrow').textContent = isAdmin ? 'ALL GANGS ORDERS' : 'YOUR ORDERS';
    $('customerHeader').hidden = !isAdmin;
    $('ordersEmpty').textContent = isAdmin
      ? 'لا توجد طلبات مسجلة بعد.'
      : 'لم تسجّل أي طلب بعد.';
    showView('orders');
    try { await loadOrders(); } catch (error) { toast(error.message, true); }
    return;
  }
  if (name === 'admin') {
    if (!state.me.isAdmin) {
      location.hash = '#/shop';
      return;
    }
    showView('admin');
    try { await loadAdmin(); } catch (error) { toast(error.message, true); }
    return;
  }
  showView('shop');
  try { await loadProducts(); } catch (error) { toast(error.message, true); }
}

function bindEvents() {
  $('searchInput').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderProducts();
  });

  $('categoryChips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.dataset.category;
    renderCategories();
    renderProducts();
  });

  $('productsGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (button) openBuyModal(button.dataset.buy);
  });

  $('buyModal').addEventListener('click', (event) => {
    if (event.target.dataset.close) $('buyModal').hidden = true;
  });
  $('buyQuantity').addEventListener('input', updateBuyTotal);

  $('confirmBuy').addEventListener('click', async () => {
    const quantity = Math.floor(Number($('buyQuantity').value));
    try {
      await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ productId: state.selectedProduct.id, quantity }),
      });
      $('buyModal').hidden = true;
      toast('تم تسجيل طلبك بنجاح.');
      await loadProducts();
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('productId').value;
    try {
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(formBody()),
      });
      toast(id ? 'تم تحديث المنتج.' : 'تمت إضافة المنتج.');
      resetForm();
      await loadAdmin();
      await loadProducts();
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('resetFormBtn').addEventListener('click', resetForm);

  $('adminProducts').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const product = state.adminProducts.find((item) => item.id === edit.dataset.edit);
      if (product) fillForm(product);
      return;
    }
    const remove = event.target.closest('[data-delete]');
    if (remove && confirm('هل تريد حذف هذا المنتج نهائياً؟')) {
      try {
        await api(`/api/admin/products/${remove.dataset.delete}`, { method: 'DELETE' });
        toast('تم حذف المنتج.');
        await loadAdmin();
        await loadProducts();
      } catch (error) { toast(error.message, true); }
      return;
    }
    const save = event.target.closest('[data-quicksave]');
    if (save) {
      const id = save.dataset.quicksave;
      const product = state.adminProducts.find((item) => item.id === id);
      const price = $(`[data-price="${id}"]`).value;
      const stock = $(`[data-stock="${id}"]`).value;
      try {
        await api(`/api/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...product, price, stock }),
        });
        toast('تم حفظ السعر والكمية.');
        await loadAdmin();
        await loadProducts();
      } catch (error) { toast(error.message, true); }
    }
  });

  $('adminOrdersBody').addEventListener('change', async (event) => {
    const select = event.target.closest('[data-status]');
    if (!select) return;
    try {
      await api(`/api/orders/${select.dataset.status}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value }),
      });
      toast('تم تحديث حالة الطلب.');
      await loadAdmin();
    } catch (error) { toast(error.message, true); }
  });

  window.addEventListener('hashchange', route);
}

async function init() {
  bindEvents();
  setInterval(() => {
    const clock = $('consoleClock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('en-GB');
  }, 1000);
  try {
    const [configData, meData] = await Promise.all([
      api('/api/config'),
      api('/api/me'),
    ]);
    state.config = configData;
    state.me = meData.user;

    $('demoBanner').hidden = !configData.demoMode && !configData.previewMode;
    if (configData.previewMode) {
      $('demoBanner').innerHTML = 'وضع المعاينة — تشوف دابا بمنظور القانق. '
        + '<a href="/auth/preview?as=admin">منظور الأدمن</a> · '
        + '<a href="/auth/preview?as=denied">صفحة الرفض</a>';
    }
    $('roleHint').textContent = `الدخول مقتصر على أعضاء السيرفر الحاصلين على رول «${configData.shopRoleName}».`;
    document.querySelectorAll('#inviteLink, #inviteLink2').forEach((link) => {
      link.href = configData.inviteUrl;
    });
    renderUser();
    await route();
  } catch (error) {
    toast('تعذّر تحميل الموقع: ' + error.message, true);
  }
}

init();
