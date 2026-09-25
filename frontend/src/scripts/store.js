const DRIP_STORAGE = {
  products: "dripcartel_products_v2",
  cart: "dripcartel_cart_v2",
  legacyCart: "dripcartel_cart_v1",
  theme: "dripcartel_theme_v1",
  orders: "dripcartel_orders_v1",
  wishlist: "dripcartel_wishlist_v1",
  account: "dripcartel_account_v2",
  catalogVersion: "dripcartel_catalog_version_v5"
};

// Locked catalogue prices. These are the prices requested for the live storefront.
// They are applied to defaults, cached products, and API responses so an old
// localStorage/DB value cannot make a product price appear to change.
const LOCKED_PRICES = Object.freeze({
  "hoodie-blue": 350,
  "hoodie-pink": 350,
  "hoodie-zip": 400,
  "hoodie-white": 400,
  "tee-signature": 250,
  "tee-black": 200,
  "tee-white": 200,
  "trouser-black": 400,
  "trouser-grey": 400,
  "cap-001": 100,
  "tote-001": 120,
  "tote-002": 120,
  "hoodie-original": 350
});

function canonicalProductPrice(product) {
  if (!product) return 0;
  if (Object.prototype.hasOwnProperty.call(LOCKED_PRICES, product.id)) return LOCKED_PRICES[product.id];
  if (product.category === "Hoodies" && /\b(zip|zipper)\b/i.test(`${product.id || ""} ${product.name || ""}`)) return 400;
  return Number(product.price);
}

function normalizeProduct(product) {
  const normalized = normalizeProductAssets(product || {});
  return { ...normalized, price: canonicalProductPrice(normalized) };
}

const DEFAULT_PRODUCTS = [
  {id:"hoodie-original",name:"DripCartel Signature Hoodie",category:"Hoodies",price:350,stock:24,sizes:["S","M","L"],colours:["White"],gallery:["assets/originalfront.webp","assets/originalback.webp"],description:"The DripCartel signature hoodie, shown in front and back views.",image:"assets/originalfront.webp",badge:"ORIGINAL"},
  {id:"tee-signature",name:"DripCartel Signature Tee",category:"T-Shirts",price:250,stock:24,sizes:["S","M","L"],colours:["White"],gallery:["assets/tshirt-front.webp","assets/tshirt-back.webp"],description:"The DripCartel signature tee, shown in front and back views.",image:"assets/tshirt-front.webp",badge:"SIGNATURE"},
  {id:"tee-black",name:"DripCartel Black Tee",category:"T-Shirts",price:200,stock:18,sizes:["S","M","L"],colours:["Black"],gallery:["assets/tshirtblackfront.webp","assets/tshirtblackback.webp"],description:"A clean black tee finished with the DripCartel mark, shown in front and back views.",image:"assets/tshirtblackfront.webp",badge:"NEW"},
  {id:"tee-white",name:"DripCartel Classic White Tee",category:"T-Shirts",price:200,stock:18,sizes:["S","M","L"],colours:["White"],gallery:["assets/tshirtwhitefront.webp","assets/tshirtwhiteback.webp"],description:"A clean classic white tee with DripCartel branding, shown in front and back views.",image:"assets/tshirtwhitefront.webp",badge:"NEW"},
  {id:"hoodie-blue",name:"Drip Blue Design Hoodie",category:"Hoodies",price:350,stock:14,sizes:["S","M","L"],colours:["White / Blue"],gallery:["assets/bluedesignhoodie.webp","assets/bluedesignhoodie-back.webp"],description:"A bold blue DripCartel design hoodie, shown front and back.",image:"assets/bluedesignhoodie.webp",badge:"NEW"},
  {id:"hoodie-pink",name:"Drip Pink Design Hoodie",category:"Hoodies",price:350,stock:14,sizes:["S","M","L"],colours:["White / Pink"],gallery:["assets/pinkdesignhoodie.webp","assets/pinkdesignhoodie-back.webp"],description:"A vivid pink DripCartel design hoodie, shown front and back.",image:"assets/pinkdesignhoodie.webp",badge:"NEW"},
  {id:"hoodie-zip",name:"DripCartel Zip Hoodie Black",category:"Hoodies",price:400,stock:14,sizes:["S","M","L"],colours:["Black"],gallery:["assets/zipper-hoodie.webp","assets/zipper-hoodie-back.webp"],description:"A clean everyday zip hoodie with front and back views.",image:"assets/zipper-hoodie.webp",badge:"NEW"},
  {id:"hoodie-white",name:"DripCartel Zip Hoodie White",category:"Hoodies",price:400,stock:9,sizes:["S","M","L"],colours:["White"],gallery:["assets/professional-white-hoodie-small-logo.webp","assets/professional-white-hoodie-small-logo-back.webp"],description:"A premium white hoodie with a small DripCartel logo, shown front and back.",image:"assets/professional-white-hoodie-small-logo.webp",badge:"LIMITED"},
  {id:"trouser-black",name:"DripCartel Black Trousers",category:"Trousers",price:400,stock:24,sizes:["S","M","L"],colours:["Black"],gallery:["assets/black-pants.webp"],description:"DripCartel black trousers with a relaxed streetwear silhouette.",image:"assets/black-pants.webp",badge:"NEW"},
  {id:"trouser-grey",name:"DripCartel Grey Trousers",category:"Trousers",price:400,stock:24,sizes:["S","M","L"],colours:["Grey"],gallery:["assets/grey-pants.webp"],description:"DripCartel grey trousers with a relaxed streetwear silhouette.",image:"assets/grey-pants.webp",badge:"NEW"},
  {id:"cap-001",name:"DripCartel Straight Cap",category:"Caps",price:100,stock:20,sizes:["One Size"],colours:["Black"],gallery:["assets/straight-cap-black.webp"],description:"A structured black cap finished with the DripCartel logo.",image:"assets/straight-cap-black.webp",badge:"NEW"},
  {id:"tote-001",name:"Drip Utility Tote — Black",category:"Tote Bags",price:120,stock:22,sizes:["One Size"],colours:["Black"],gallery:["assets/blackback.webp"],description:"The black DripCartel tote for everyday carry.",image:"assets/blackback.webp",badge:""},
  {id:"tote-002",name:"Drip Utility Tote — White",category:"Tote Bags",price:120,stock:16,sizes:["One Size"],colours:["White"],gallery:["assets/whitebag.webp"],description:"The white DripCartel tote with a clean finish.",image:"assets/whitebag.webp",badge:"NEW"}
];

const PRODUCT_IMAGE_MANIFEST = Object.freeze({
  "hoodie-original": ["assets/originalfront.webp", "assets/originalback.webp"],
  "tee-signature": ["assets/tshirt-front.webp", "assets/tshirt-back.webp"],
  "tee-black": ["assets/tshirtblackfront.webp", "assets/tshirtblackback.webp"],
  "tee-white": ["assets/tshirtwhitefront.webp", "assets/tshirtwhiteback.webp"],
  "hoodie-blue": ["assets/bluedesignhoodie.webp", "assets/bluedesignhoodie-back.webp"],
  "hoodie-pink": ["assets/pinkdesignhoodie.webp", "assets/pinkdesignhoodie-back.webp"],
  "hoodie-zip": ["assets/zipper-hoodie.webp", "assets/zipper-hoodie-back.webp"],
  "hoodie-white": ["assets/professional-white-hoodie-small-logo.webp", "assets/professional-white-hoodie-small-logo-back.webp"],
  "trouser-black": ["assets/black-pants.webp"],
  "trouser-grey": ["assets/grey-pants.webp"],
  "cap-001": ["assets/straight-cap-black.webp"],
  "tote-001": ["assets/blackback.webp"],
  "tote-002": ["assets/whitebag.webp"]
});

function productAssetFallbacks(product){
  const manifest = PRODUCT_IMAGE_MANIFEST[product?.id];
  if (!manifest) return [];
  return manifest.map(normalizeAssetPath);
}

function normalizeAssetPath(path=""){
  const raw = String(path || "").trim().replaceAll("\\", "/");
  const map = {
    "assets/originalfront.webp":"assets/originalfront.webp",
    "assets/originalback.webp":"assets/originalback.webp",
    "assets/tshirt front.webp":"assets/tshirt-front.webp",
    "assets/tshirt back.webp":"assets/tshirt-back.webp",
    "assets/tshirtblackfront.webp":"assets/tshirtblackfront.webp",
    "assets/tshirtblackback.webp":"assets/tshirtblackback.webp",
    "assets/tshirtwhitefront.webp":"assets/tshirtwhitefront.webp",
    "assets/tshirtwhiteback.webp":"assets/tshirtwhiteback.webp",
    "assets/bluedesignhoodie.webp":"assets/bluedesignhoodie.webp",
    "assets/bluedesignhoodie-back.webp":"assets/bluedesignhoodie-back.webp",
    "assets/pinkdesignhoodie.webp":"assets/pinkdesignhoodie.webp",
    "assets/pinkdesignhoodie-back.webp":"assets/pinkdesignhoodie-back.webp",
    "assets/zipper-hoodie.webp":"assets/zipper-hoodie.webp",
    "assets/zipper-hoodie-back.webp":"assets/zipper-hoodie-back.webp",
    "assets/professional-white-hoodie-small-logo.webp":"assets/professional-white-hoodie-small-logo.webp",
    "assets/professional-white-hoodie-small-logo-back.webp":"assets/professional-white-hoodie-small-logo-back.webp",
    "assets/black-pants.webp":"assets/black-pants.webp",
    "assets/grey-pants.webp":"assets/grey-pants.webp",
    "assets/straight-cap-black.webp":"assets/straight-cap-black.webp",
    "assets/whitebag.webp":"assets/whitebag.webp",
    "assets/blackback.webp":"assets/blackback.webp",
    "assets/storytelling.webp":"assets/storytelling.webp",
    "assets/whatsapp-image-2026-09-22-at-17-26-41.webp":"assets/whatsapp-image-2026-09-22-at-17-26-41.webp",
    "assets/originalfront.webp":"assets/originalfront.webp",
    "assets/originalback.webp":"assets/originalback.webp",
    "assets/tshirtfront.webp":"assets/tshirt-front.webp",
    "assets/tshirtback.webp":"assets/tshirt-back.webp",
    "assets/tshirtblackfront.webp":"assets/tshirtblackfront.webp",
    "assets/tshirtblackback.webp":"assets/tshirtblackback.webp",
    "assets/tshirtwhitefront.webp":"assets/tshirtwhitefront.webp",
    "assets/tshirtwhiteback.webp":"assets/tshirtwhiteback.webp",
    "assets/straight cap black.webp":"assets/straight-cap-black.webp",
    "assets/zipper hoodie.webp":"assets/zipper-hoodie.webp",
    "assets/whitebag.webp":"assets/whitebag.webp",
    "assets/storytelling.webp":"assets/storytelling.webp",
    "assets/whatsapp image 2026-09-22 at 17.26.41.webp":"assets/whatsapp-image-2026-09-22-at-17-26-41.webp"
  };
  const key = raw.toLowerCase();
  return map[key] || map[raw] || raw;
}
function normalizeProductAssets(product){
  const fallbacks = productAssetFallbacks(product);
  const image = normalizeAssetPath(product.image || "") || fallbacks[0] || "";
  const gallery = Array.isArray(product.gallery) && product.gallery.length
    ? product.gallery.map(normalizeAssetPath).filter(Boolean)
    : fallbacks;
  return {
    ...product,
    image: image || fallbacks[0] || "",
    gallery: gallery.length ? gallery : fallbacks
  };
}
function loadProducts(){
  const catalogVersion = "12";
  const savedVersion = localStorage.getItem(DRIP_STORAGE.catalogVersion);
  try {
    if (savedVersion !== catalogVersion) {
      const fresh = DEFAULT_PRODUCTS.map(normalizeProduct);
      localStorage.setItem(DRIP_STORAGE.products, JSON.stringify(fresh));
      localStorage.setItem(DRIP_STORAGE.catalogVersion, catalogVersion);
      return JSON.parse(JSON.stringify(fresh));
    }

    const saved = JSON.parse(localStorage.getItem(DRIP_STORAGE.products) || "[]");
    const byId = new Map(DEFAULT_PRODUCTS.map(product => [product.id, normalizeProduct(product)]));
    if (Array.isArray(saved)) {
      saved.map(normalizeProduct).forEach(product => {
        if (!product?.id) return;
        const base = byId.get(product.id);
        const merged = base
          ? { ...base, ...product, price: canonicalProductPrice({ ...base, ...product }), image: normalizeAssetPath(product.image || base.image || ""), gallery: Array.isArray(product.gallery) && product.gallery.length ? product.gallery.map(normalizeAssetPath) : base.gallery }
          : normalizeProduct(product);
        byId.set(merged.id, normalizeProduct(merged));
      });
    }
    const products = [...byId.values()];
    localStorage.setItem(DRIP_STORAGE.products, JSON.stringify(products));
    localStorage.setItem(DRIP_STORAGE.catalogVersion, catalogVersion);
    return products;
  } catch {
    const fresh = DEFAULT_PRODUCTS.map(normalizeProduct);
    localStorage.setItem(DRIP_STORAGE.products, JSON.stringify(fresh));
    localStorage.setItem(DRIP_STORAGE.catalogVersion, catalogVersion);
    return JSON.parse(JSON.stringify(fresh));
  }
}
function saveProducts(products){ localStorage.setItem(DRIP_STORAGE.products, JSON.stringify(products)); }
function loadOrders(){ try { return JSON.parse(localStorage.getItem(DRIP_STORAGE.orders) || "[]"); } catch { return []; } }
function saveOrder(order){ try { const orders=loadOrders(); orders.unshift(order); localStorage.setItem(DRIP_STORAGE.orders, JSON.stringify(orders)); return true; } catch { return false; } }
function updateOrderStatus(id,status){ const orders=loadOrders(); const order=orders.find(item=>item.id===id); if(!order)return false; order.status=status; localStorage.setItem(DRIP_STORAGE.orders,JSON.stringify(orders)); return true; }
function loadWishlist(){ try { return JSON.parse(localStorage.getItem(DRIP_STORAGE.wishlist) || "[]"); } catch { return []; } }
function saveWishlist(wishlist){ localStorage.setItem(DRIP_STORAGE.wishlist, JSON.stringify(wishlist)); window.dispatchEvent(new Event("wishlistUpdated")); }
function toggleWishlist(id){ const wishlist=loadWishlist(); const index=wishlist.indexOf(id); if(index>=0) wishlist.splice(index,1); else wishlist.push(id); saveWishlist(wishlist); return index<0; }
function loadAccount(){
  try {
    const account = JSON.parse(sessionStorage.getItem(DRIP_STORAGE.account) || "null");
    if (!account || account.isDemo) return null;
    return account;
  } catch { return null; }
}
function saveAccount(account){ sessionStorage.setItem(DRIP_STORAGE.account, JSON.stringify(account)); window.dispatchEvent(new Event("accountUpdated")); }
function clearLocalAccount(){ localStorage.removeItem(DRIP_STORAGE.account); sessionStorage.removeItem(DRIP_STORAGE.account); sessionStorage.removeItem("dripcartel_signed_in"); }
function normalizeEmail(email){ return String(email || "").trim().toLowerCase(); }
function normalizePhone(phone){ return String(phone || "").replace(/\D/g, ""); }
function validEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }
function validPhone(phone){ const digits=normalizePhone(phone); return digits.length >= 9 && digits.length <= 15; }
function setCurrentAccount(account){ const safe={id:account.id,firstName:account.firstName,lastName:account.lastName,email:account.email,phone:account.phone,createdAt:account.createdAt}; saveAccount(safe); setSignedIn(true); }
function loadCart(){
  try {
    // v2 intentionally does not migrate the old cart. A fresh catalogue/session
    // must begin empty; only items explicitly added by the customer are stored.
    if (!localStorage.getItem(DRIP_STORAGE.cart)) {
      localStorage.removeItem(DRIP_STORAGE.legacyCart);
      localStorage.setItem(DRIP_STORAGE.cart, "[]");
    }
    const parsed = JSON.parse(localStorage.getItem(DRIP_STORAGE.cart) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try { localStorage.setItem(DRIP_STORAGE.cart, "[]"); } catch {}
    return [];
  }
}
function saveCart(cart){
  const safeCart = Array.isArray(cart) ? cart : [];
  localStorage.setItem(DRIP_STORAGE.cart, JSON.stringify(safeCart));
  window.dispatchEvent(new Event("cartUpdated"));
}
function isSignedIn(){ return sessionStorage.getItem("dripcartel_signed_in") === "true"; }
function setSignedIn(value=true){ if(value) sessionStorage.setItem("dripcartel_signed_in","true"); else sessionStorage.removeItem("dripcartel_signed_in"); }
function loadTheme(){ return localStorage.getItem(DRIP_STORAGE.theme) || "dark"; }
function saveTheme(theme){ localStorage.setItem(DRIP_STORAGE.theme, theme); }
function money(v){ return "R" + Number(v).toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function escapeHTML(value=""){ return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function safeImageMarkup(src, alt="", className=""){
  const fallback = "assets/dripcartel-icon.webp";
  return `<img class="${escapeHTML(className)}" src="${escapeHTML(normalizeAssetPath(src || fallback))}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fallback}'">`;
}
function productVisual(product){
  if(product.image) return safeImageMarkup(product.image, product.name);
  const cls = product.category.toLowerCase().replace(/[^a-z]/g,"");
  return `<div class="product-art ${cls}"><img src="assets/dripcartel-icon.webp" alt=""><span>${escapeHTML(product.category)}</span></div>`;
}
