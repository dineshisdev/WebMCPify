import { Router, withBase } from './router.js';

const CART_KEY = 'cart';
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const DOT = {
  black: '#16161a', white: '#f4f4f0', blue: '#2563eb', navy: '#1e3a8a', red: '#c62828',
  gold: '#c9a227', green: '#1f7a4d', grey: '#9ca3af', gray: '#9ca3af', orange: '#e8481c',
  cream: '#f3ead3', brown: '#6b4423', pink: '#db2777', purple: '#6d28d9', yellow: '#eab308',
};

const CATEGORIES = ['running', 'lifestyle', 'basketball', 'trail'];
const SIZES = ['6', '7', '8', '9', '10', '11', '12'];

let catalog = [];
const router = new Router();
let toastTimer;

function fmt(n) { return INR.format(n); }
function stars(n) { return '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shoeArt(p) {
  const bg = p.art?.bg || '#222';
  const ac = p.art?.accent || '#fff';
  return `<svg class="art" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="background:${bg}">
    <rect width="320" height="200" fill="${bg}"/>
    <ellipse cx="168" cy="168" rx="108" ry="10" fill="rgba(0,0,0,.18)"/>
    <path d="M36 132c22-10 46-46 88-50 30-3 52 10 90 8 28-2 50-20 70-18 6 18 4 42-12 54-42 30-148 34-206 18-18-5-34-10-30-12z" fill="${ac}"/>
    <path d="M72 128c20-4 52-8 94-6 38 2 72 10 110 4" fill="none" stroke="${bg}" stroke-width="5" opacity=".35"/>
    <path d="M58 118c8-18 28-32 48-28" fill="none" stroke="${bg}" stroke-width="4" opacity=".25"/>
  </svg>`;
}

function colorDots(colors) {
  return `<span class="dots">${colors.map((c) => `<span class="dot" title="${esc(c)}" style="background:${DOT[c] || '#888'}"></span>`).join('')}</span>`;
}

function unique(arr) {
  return [...new Set(arr)];
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => x && x.id && x.size) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  renderCartCount();
}

function cartCount() {
  return loadCart().reduce((n, x) => n + (Number(x.qty) || 0), 0);
}

function renderCartCount() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  const n = cartCount();
  el.textContent = String(n);
  el.classList.toggle('has-items', n > 0);
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function productCard(p, badge) {
  const out = p.stock <= 0;
  return `<li class="product-card${out ? ' is-out' : ''}" data-product-id="${esc(p.id)}">
    <div class="card-art">${shoeArt(p)}${badge ? `<span class="card-badge${badge === 'hot' ? ' badge-hot' : ''}">${esc(badge === 'hot' ? 'Hot' : badge)}</span>` : ''}${out ? '<span class="card-badge">Sold out</span>' : ''}</div>
    <div class="card-body">
      <div class="product-brand">${esc(p.brand)}</div>
      <h3 class="product-name"><a class="product-link" href="/product/${esc(p.id)}">${esc(p.name)}</a></h3>
      <div class="product-rating">${stars(p.rating)} ${p.rating.toFixed(1)}</div>
      <div class="card-colors">${colorDots(p.colors)} <span class="product-colors">${esc(p.colors.join(', '))}</span></div>
      <div class="product-price">${fmt(p.price)}</div>
    </div>
  </li>`;
}

function setNav(path) {
  document.querySelectorAll('.site-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const on = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function mount(html) {
  const app = document.getElementById('app');
  app.innerHTML = html;
  app.focus({ preventScroll: true });
  renderCartCount();
}

function parseShopQuery(query) {
  return {
    q: (query.get('q') || '').trim(),
    category: query.get('category') || '',
    color: query.get('color') || '',
    size: query.get('size') || '',
    max_price: query.get('max_price') || '',
    sort: query.get('sort') || 'relevance',
  };
}

function filterCatalog(f) {
  let list = catalog.slice();
  const q = f.q.toLowerCase();
  if (q) {
    list = list.filter((p) =>
      [p.name, p.brand, p.category, p.description, ...(p.colors || [])].join(' ').toLowerCase().includes(q),
    );
  }
  if (f.category) list = list.filter((p) => p.category === f.category);
  if (f.color) list = list.filter((p) => p.colors.some((c) => c.toLowerCase() === f.color.toLowerCase()));
  if (f.size) list = list.filter((p) => p.sizes.includes(f.size));
  if (f.max_price) {
    const max = Number(f.max_price);
    if (!Number.isNaN(max) && max > 0) list = list.filter((p) => p.price <= max);
  }
  switch (f.sort) {
    case 'price-asc': list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'rating': list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews); break;
    default: break;
  }
  return list;
}

function shopQueryFromForm() {
  const params = new URLSearchParams();
  const set = (k, v) => { if (v) params.set(k, v); };
  set('q', document.getElementById('search')?.value?.trim());
  set('category', document.getElementById('category')?.value);
  set('color', document.getElementById('color')?.value);
  set('size', document.getElementById('size')?.value);
  set('max_price', document.getElementById('max-price')?.value);
  const sort = document.getElementById('sort')?.value;
  if (sort && sort !== 'relevance') params.set('sort', sort);
  return params;
}

function bindShopFilters() {
  const form = document.getElementById('search-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    router.navigate('/shop?' + shopQueryFromForm().toString());
  });
  ['category', 'color', 'size', 'sort', 'max-price'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      router.navigate('/shop?' + shopQueryFromForm().toString(), { replace: true });
    });
  });
  document.getElementById('clear-filters')?.addEventListener('click', () => router.navigate('/shop'));
}

function optionList(values, selected, allLabel) {
  return `<option value="">${esc(allLabel)}</option>` + values.map((v) =>
    `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v[0].toUpperCase() + v.slice(1))}</option>`,
  ).join('');
}

function renderHome() {
  setNav('/');
  const featured = catalog.filter((p) => p.stock > 0).slice(0, 8);
  const hero = catalog.find((p) => p.id === 'sn-001') || featured[0];
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.filter((p) => p.category === c)]));
  mount(`
    <section class="hero">
      <div class="container hero-inner">
        <div>
          <p class="eyebrow">Stride Legacy Store</p>
          <h1>Sneakers for every stride.</h1>
          <p class="lede">Running, lifestyle, basketball and trail shoes from Nivo, Cloudstep, Trailform, Kinetik and Urbane. Shipped from Bengaluru to every PIN code in India.</p>
          <div class="hero-actions">
            <a class="btn btn-accent btn-lg" href="/shop">Shop the catalog</a>
            <a class="btn btn-ghost btn-lg" href="/shop?category=running">Shop running</a>
          </div>
          <div class="hero-proof">
            <span><strong>24</strong> styles in stock</span>
            <span><strong>Free</strong> shipping over ₹2,999</span>
            <span><strong>30-day</strong> returns</span>
          </div>
        </div>
        ${hero ? `<a class="hero-art" href="/product/${esc(hero.id)}" style="--hero-bg:${hero.art.bg}">${shoeArt(hero)}<span class="hero-chip"><span class="hero-chip-name">${esc(hero.name)}</span><span class="hero-chip-price">${fmt(hero.price)}</span></span></a>` : ''}
      </div>
    </section>
    <section class="section container">
      <div class="section-head"><h2>Shop by category</h2><a href="/shop">View all</a></div>
      <div class="category-tiles">
        ${CATEGORIES.map((c) => {
          const sample = byCat[c][0];
          return `<a class="tile" href="/shop?category=${c}">${sample ? shoeArt(sample) : ''}<span class="tile-label">${esc(c[0].toUpperCase() + c.slice(1))}<small>${byCat[c].length} styles</small></span></a>`;
        }).join('')}
      </div>
    </section>
    <section class="section container">
      <div class="section-head"><h2>Staff picks</h2><a href="/shop?sort=rating">Best rated</a></div>
      <ul class="product-grid">${featured.map((p, i) => productCard(p, i < 2 ? 'hot' : '')).join('')}</ul>
    </section>
    <section class="section container">
      <div class="perks">
        <div class="perk"><div class="perk-icon">⌂</div><div><h3>Free shipping over ₹2,999</h3><p>COD and card-on-delivery across India.</p></div></div>
        <div class="perk"><div class="perk-icon">↺</div><div><h3>30-day easy returns</h3><p>Unworn pairs, original box. No questions.</p></div></div>
        <div class="perk"><div class="perk-icon">★</div><div><h3>Verified reviews</h3><p>Ratings from people who actually ran in them.</p></div></div>
      </div>
    </section>
  `);
}

function renderShop(_params, query) {
  setNav('/shop');
  const f = parseShopQuery(query);
  const colors = unique(catalog.flatMap((p) => p.colors)).sort();
  const list = filterCatalog(f);
  mount(`
    <div class="container page">
      <div class="page-head">
        <h1>Shop</h1>
        <form id="search-form" class="search" role="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input id="search" name="q" type="search" placeholder="Search name, brand, color…" value="${esc(f.q)}" autocomplete="off">
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
      </div>
      <div class="shop-layout">
        <aside class="filters" aria-label="Filters">
          <div class="filters-head"><h2>Filters</h2><button type="button" class="link-btn" id="clear-filters">Clear</button></div>
          <div class="filter-group">
            <label for="category">Category</label>
            <select id="category">${optionList(CATEGORIES, f.category, 'All categories')}</select>
          </div>
          <div class="filter-group">
            <label for="color">Color</label>
            <select id="color">${optionList(colors, f.color, 'All colors')}</select>
          </div>
          <div class="filter-group">
            <label for="size">UK size</label>
            <select id="size">${optionList(SIZES, f.size, 'All sizes')}</select>
          </div>
          <div class="filter-group">
            <label for="max-price">Max price (INR)</label>
            <input id="max-price" name="max_price" type="number" min="0" step="100" placeholder="e.g. 10000" value="${esc(f.max_price)}">
          </div>
        </aside>
        <div>
          <div class="toolbar">
            <span id="result-count">${list.length} style${list.length === 1 ? '' : 's'}</span>
            <div class="sort">
              <label for="sort">Sort</label>
              <select id="sort">
                <option value="relevance"${f.sort === 'relevance' ? ' selected' : ''}>Relevance</option>
                <option value="price-asc"${f.sort === 'price-asc' ? ' selected' : ''}>Price: low to high</option>
                <option value="price-desc"${f.sort === 'price-desc' ? ' selected' : ''}>Price: high to low</option>
                <option value="rating"${f.sort === 'rating' ? ' selected' : ''}>Top rated</option>
              </select>
            </div>
          </div>
          ${list.length
            ? `<ul id="product-grid" class="product-grid">${list.map((p) => productCard(p)).join('')}</ul>`
            : `<ul id="product-grid" class="product-grid" hidden></ul><div id="no-results"><p>No products matched. Try a broader keyword or clear a filter.</p></div>`}
        </div>
      </div>
    </div>
  `);
  bindShopFilters();
}

function renderProduct({ id }) {
  setNav('/shop');
  const p = catalog.find((x) => x.id === id);
  if (!p) {
    mount(`<div class="container page"><div class="empty" id="product-not-found"><h1>Product not found</h1><p>We don't have a sneaker with id ${esc(id)}.</p><a class="btn btn-primary" href="/shop">Back to shop</a></div></div>`);
    return;
  }
  const inStock = p.stock > 0;
  const related = catalog.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  mount(`
    <div class="container page" id="product-detail" data-product-id="${esc(p.id)}">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><a href="/shop">Shop</a><span>/</span><a href="/shop?category=${esc(p.category)}">${esc(p.category)}</a><span>/</span><span aria-current="page">${esc(p.name)}</span>
      </nav>
      <div class="pdp-layout">
        <div class="pdp-art">${shoeArt(p)}</div>
        <div class="pdp-info">
          <div class="product-brand" id="product-brand">${esc(p.brand)}</div>
          <h1 id="product-title">${esc(p.name)}</h1>
          <div class="pdp-meta">
            <span class="rating" id="product-rating">${stars(p.rating)} ${p.rating.toFixed(1)} (${p.reviews})</span>
            <span id="stock-status" class="stock ${inStock ? 'in' : 'out'}">${inStock ? `${p.stock} in stock` : 'Out of stock'}</span>
          </div>
          <div class="pdp-price" id="product-price">${fmt(p.price)}</div>
          <p class="tax-note">Inclusive of taxes. Free shipping over ₹2,999.</p>
          <p class="pdp-desc" id="product-desc">${esc(p.description)}</p>
          <div class="pdp-colors"><span class="label">Colors</span>${colorDots(p.colors)} <span class="product-colors">${esc(p.colors.join(', '))}</span></div>
          <form class="buy-box" id="add-form">
            <div class="field">
              <label for="size-select">UK size</label>
              <select id="size-select" required>
                <option value="" disabled selected>Select size</option>
                ${p.sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="qty">Qty</label>
              <input id="qty" name="qty" type="number" min="1" max="10" value="1">
            </div>
            <button class="btn btn-accent btn-lg" id="add-to-cart" type="submit"${inStock ? '' : ' disabled'}>${inStock ? 'Add to cart' : 'Out of stock'}</button>
          </form>
          <ul class="specs" id="product-specs">
            <li><span class="spec-label">Weight</span><span class="spec-value">${p.weightGrams} g</span></li>
            <li><span class="spec-label">Drop</span><span class="spec-value">${p.drop} mm</span></li>
            <li><span class="spec-label">Upper</span><span class="spec-value">${esc(p.upper)}</span></li>
            <li><span class="spec-label">Sole</span><span class="spec-value">${esc(p.sole)}</span></li>
            <li><span class="spec-label">Category</span><span class="spec-value">${esc(p.category)}</span></li>
            <li><span class="spec-label">Reviews</span><span class="spec-value">${p.reviews}</span></li>
          </ul>
        </div>
      </div>
      ${related.length ? `<section class="related"><div class="section-head"><h2>You may also like</h2></div><ul class="product-grid">${related.map((x) => productCard(x)).join('')}</ul></section>` : ''}
    </div>
  `);
  document.getElementById('add-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const size = document.getElementById('size-select').value;
    const qty = Math.max(1, Math.min(10, Number(document.getElementById('qty').value) || 1));
    if (!size) {
      document.getElementById('size-select').setAttribute('aria-invalid', 'true');
      return;
    }
    if (p.stock <= 0) return;
    const items = loadCart();
    const existing = items.find((x) => x.id === p.id && x.size === size);
    if (existing) existing.qty = Math.min(10, existing.qty + qty);
    else items.push({ id: p.id, size, qty });
    saveCart(items);
    toast(`Added ${p.name} (UK ${size}) to cart`);
  });
}

function lineItems() {
  return loadCart().map((row) => {
    const p = catalog.find((x) => x.id === row.id);
    return p ? { ...row, product: p, line: p.price * row.qty } : null;
  }).filter(Boolean);
}

function renderCart() {
  setNav('/cart');
  const items = lineItems();
  const subtotal = items.reduce((n, x) => n + x.line, 0);
  const ship = subtotal >= 2999 || subtotal === 0 ? 0 : 149;
  mount(`
    <div class="container page" id="cart-page">
      <h1>Cart</h1>
      ${items.length === 0
        ? `<div class="empty" id="cart-empty"><h1>Your cart is empty</h1><p>Find a pair and add it — we'll keep it here.</p><a class="btn btn-primary" href="/shop">Shop sneakers</a></div>`
        : `<div class="cart-layout">
            <table class="cart-table" id="cart-table">
              <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th></th></tr></thead>
              <tbody>
                ${items.map((x) => `<tr class="cart-row" data-product-id="${esc(x.id)}" data-size="${esc(x.size)}">
                  <td><a class="cart-thumb" href="/product/${esc(x.id)}">${shoeArt(x.product)}</a>
                    <a class="cart-name" href="/product/${esc(x.id)}">${esc(x.product.name)}</a>
                    <span class="cart-brand">${esc(x.product.brand)}</span></td>
                  <td class="cart-size">${esc(x.size)}</td>
                  <td>
                    <div class="qty-stepper">
                      <button class="qty-btn" type="button" data-act="dec" aria-label="Decrease">−</button>
                      <span class="cart-qty">${x.qty}</span>
                      <button class="qty-btn" type="button" data-act="inc" aria-label="Increase">+</button>
                    </div>
                  </td>
                  <td><div class="cart-unit">${fmt(x.product.price)}</div><div class="cart-line-total">${fmt(x.line)}</div></td>
                  <td><button class="cart-remove" type="button" data-act="rm" aria-label="Remove">×</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
            <aside class="summary">
              <h2>Summary</h2>
              <dl>
                <div><dt>Subtotal</dt><dd id="cart-subtotal">${fmt(subtotal)}</dd></div>
                <div><dt>Shipping</dt><dd>${ship === 0 ? 'Free' : fmt(ship)}</dd></div>
                <div class="total"><dt>Total</dt><dd>${fmt(subtotal + ship)}</dd></div>
              </dl>
              <a class="btn btn-accent btn-block" id="checkout-link" href="/checkout">Checkout</a>
              <a class="link" href="/shop">Continue shopping</a>
            </aside>
          </div>`}
    </div>
  `);
  document.getElementById('cart-table')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.cart-row');
    const id = row.getAttribute('data-product-id');
    const size = row.getAttribute('data-size');
    const items = loadCart();
    const i = items.findIndex((x) => x.id === id && x.size === size);
    if (i < 0) return;
    if (btn.dataset.act === 'rm') items.splice(i, 1);
    else if (btn.dataset.act === 'inc') items[i].qty = Math.min(10, items[i].qty + 1);
    else if (btn.dataset.act === 'dec') {
      items[i].qty -= 1;
      if (items[i].qty <= 0) items.splice(i, 1);
    }
    saveCart(items);
    renderCart();
  });
}

function renderCheckout() {
  setNav('/cart');
  const items = lineItems();
  if (items.length === 0) {
    mount(`<div class="container page"><div class="empty"><h1>Nothing to check out</h1><p>Add a pair to your cart first.</p><a class="btn btn-primary" href="/shop">Shop sneakers</a></div></div>`);
    return;
  }
  const subtotal = items.reduce((n, x) => n + x.line, 0);
  const ship = subtotal >= 2999 ? 0 : 149;
  const total = subtotal + ship;
  mount(`
    <div class="container page checkout">
      <h1>Checkout</h1>
      <div class="checkout-layout">
        <form class="checkout-form" id="checkout-form" novalidate>
          <fieldset>
            <legend>Delivery</legend>
            <div class="field"><label for="full-name">Full name</label><input id="full-name" name="full_name" type="text" required autocomplete="name"></div>
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
            <div class="field"><label for="address">Address</label><input id="address" name="address" type="text" required autocomplete="street-address"></div>
            <div class="field-row">
              <div class="field"><label for="city">City</label><input id="city" name="city" type="text" required autocomplete="address-level2"></div>
              <div class="field"><label for="pincode">PIN code</label><input id="pincode" name="pincode" type="text" required inputmode="numeric" pattern="[0-9]{6}" autocomplete="postal-code"></div>
            </div>
          </fieldset>
          <fieldset>
            <legend>Payment</legend>
            <div class="field">
              <label for="payment">Pay on delivery</label>
              <select id="payment" name="payment" required>
                <option value="cod">Cash on delivery (cod)</option>
                <option value="card">Card on delivery (card)</option>
              </select>
            </div>
          </fieldset>
          <div id="form-error" class="form-error" hidden></div>
          <button class="btn btn-accent btn-lg btn-block" id="place-order" type="submit">Place order</button>
          <p class="fine-print">This is a demo store. No payment is taken and nothing is shipped.</p>
        </form>
        <aside class="summary">
          <h2>Your order</h2>
          <ul class="summary-lines">
            ${items.map((x) => `<li><span class="summary-thumb">${shoeArt(x.product)}</span><span class="summary-name">${esc(x.product.name)}<small>UK ${esc(x.size)} × ${x.qty}</small></span><span>${fmt(x.line)}</span></li>`).join('')}
          </ul>
          <dl>
            <div><dt>Subtotal</dt><dd>${fmt(subtotal)}</dd></div>
            <div><dt>Shipping</dt><dd>${ship === 0 ? 'Free' : fmt(ship)}</dd></div>
            <div class="total"><dt>Total</dt><dd id="checkout-total">${fmt(total)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  `);
  document.getElementById('checkout-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const get = (id) => document.getElementById(id);
    const fields = ['full-name', 'email', 'address', 'city', 'pincode'];
    let ok = true;
    for (const id of fields) {
      const el = get(id);
      const valid = el.value.trim() !== '' && (id !== 'pincode' || /^\d{6}$/.test(el.value.trim())) && (id !== 'email' || /@/.test(el.value));
      el.setAttribute('aria-invalid', valid ? 'false' : 'true');
      if (!valid) ok = false;
    }
    const err = get('form-error');
    if (!ok) {
      err.hidden = false;
      err.textContent = 'Please fill every field. PIN code must be 6 digits.';
      return;
    }
    err.hidden = true;
    const orderId = 'SL-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 90 + 10);
    const order = {
      id: orderId,
      name: get('full-name').value.trim(),
      email: get('email').value.trim(),
      address: get('address').value.trim(),
      city: get('city').value.trim(),
      pincode: get('pincode').value.trim(),
      payment: get('payment').value,
      total,
      items: items.map((x) => ({ id: x.id, name: x.product.name, size: x.size, qty: x.qty, line: x.line })),
    };
    try { sessionStorage.setItem('order:' + orderId, JSON.stringify(order)); } catch { /* ignore */ }
    saveCart([]);
    router.navigate('/order/' + orderId);
  });
}

function renderOrder({ orderId }) {
  setNav('/');
  let order;
  try { order = JSON.parse(sessionStorage.getItem('order:' + orderId) || 'null'); } catch { order = null; }
  if (!order) {
    mount(`<div class="container page"><div class="empty"><h1>Order not found</h1><p>This confirmation lives only in this browser tab.</p><a class="btn btn-primary" href="/shop">Back to shop</a></div></div>`);
    return;
  }
  mount(`
    <div class="container page">
      <div class="confirm-card" id="order-confirmation">
        <div class="check" aria-hidden="true">✓</div>
        <h1>Order placed</h1>
        <p class="confirm-id">Order <span id="order-id">${esc(order.id)}</span></p>
        <p>Thanks ${esc(order.name)}. A confirmation would go to ${esc(order.email)}. This is a demo — nothing will be shipped or charged.</p>
        <ul class="summary-lines">
          ${order.items.map((x) => `<li><span class="summary-name">${esc(x.name)}<small>UK ${esc(x.size)} × ${x.qty}</small></span><span>${fmt(x.line)}</span></li>`).join('')}
        </ul>
        <dl>
          <div class="total"><dt>Total</dt><dd>${fmt(order.total)}</dd></div>
          <div><dt>Ship to</dt><dd>${esc(order.address)}, ${esc(order.city)} ${esc(order.pincode)}</dd></div>
          <div><dt>Payment</dt><dd>${order.payment === 'card' ? 'Card on delivery' : 'Cash on delivery'}</dd></div>
        </dl>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/shop">Keep shopping</a>
        </div>
      </div>
    </div>
  `);
}

function render404() {
  setNav('/');
  mount(`<div class="container page"><div class="empty"><h1>Page not found</h1><p>That URL isn't a store page.</p><a class="btn btn-primary" href="/">Home</a></div></div>`);
}

async function boot() {
  renderCartCount();
  try {
    const res = await fetch(withBase('/data/products.json'), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(res.statusText);
    catalog = await res.json();
  } catch (e) {
    mount(`<div class="container page"><div class="empty"><h1>Couldn't load the catalog</h1><p>${esc(e.message)}</p></div></div>`);
    return;
  }
  router
    .on('/', renderHome)
    .on('/shop', renderShop)
    .on('/product/:id', renderProduct)
    .on('/cart', renderCart)
    .on('/checkout', renderCheckout)
    .on('/order/:orderId', renderOrder)
    .otherwise(render404)
    .start();
}

boot();
