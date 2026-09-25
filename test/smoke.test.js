const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root=path.resolve(process.cwd());

test("production commerce foundation exists",()=>{
  const schema=fs.readFileSync(path.join(root,"database","schema.sql"),"utf8");
  for(const table of ["customer_sessions","addresses","product_variants","orders","order_items","payments","inventory_movements","shipments","refunds","audit_logs"]){
    assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} table missing`);
  }
  assert.match(schema,/payments_one_provider_per_order_idx/);
  assert.match(schema,/orders_customer_idempotency_idx/);
});

test("frontend never contains server payment secret names",()=>{
  const dir=path.join(root,"frontend");
  const files=[];
  const walk=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,entry.name);if(entry.isDirectory())walk(p);else files.push(p);}};walk(dir);
  for(const file of files){const text=fs.readFileSync(file,"utf8");assert.doesNotMatch(text,/PAYSTACK_SECRET_KEY|WHATSAPP_ACCESS_TOKEN|DATABASE_URL|JWT_SECRET/,`secret-like value in ${file}`);}
});

test("public storefront does not expose an admin navigation link",()=>{
  const html=fs.readFileSync(path.join(root,"frontend","index.html"),"utf8");
  assert.doesNotMatch(html,/>\s*Admin\s*<\/a>/i);
  assert.match(html,/privateAdminAccess/);
});

test("admin discovery is server-side and rate limited",()=>{
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  assert.match(server,/ADMIN_DISCOVERY_CODE/);
  assert.match(server,/adminDiscoveryLimiter/);
  assert.match(server,/\/api\/admin\/discover/);
});

test("github pages workflow only deploys frontend",()=>{
  const workflow=fs.readFileSync(path.join(root,".github","workflows","deploy-pages.yml"),"utf8");
  assert.match(workflow,/frontend/);
});


test("product cards include real front/back galleries and eager back images",()=>{
  const store=fs.readFileSync(path.join(root,"frontend","src","scripts","store.js"),"utf8");
  const home=fs.readFileSync(path.join(root,"frontend","src","scripts","home.js"),"utf8");
  const css=fs.readFileSync(path.join(root,"frontend","src","styles","home.css"),"utf8");
  assert.match(store,/hoodie-original[\s\S]*originalfront\.webp[\s\S]*originalback\.webp/);
  assert.match(store,/hoodie-blue[\s\S]*bluedesignhoodie\.webp[\s\S]*bluedesignhoodie-back\.webp/);
  assert.match(store,/hoodie-pink[\s\S]*pinkdesignhoodie\.webp[\s\S]*pinkdesignhoodie-back\.webp/);
  assert.match(store,/hoodie-zip[\s\S]*zipper-hoodie\.webp[\s\S]*zipper-hoodie-back\.webp/);
  assert.match(store,/hoodie-white[\s\S]*professional-white-hoodie-small-logo\.webp[\s\S]*professional-white-hoodie-small-logo-back\.webp/);
  assert.match(store,/tee-signature[\s\S]*tshirt-front\.webp[\s\S]*tshirt-back\.webp/);
  assert.match(home,/product-card-img/);
  assert.match(home,/data-back-src/);
  assert.match(home,/loading="eager"/);
  assert.match(home,/new Image\(\)/);
  assert.match(home,/mouseenter/);
  assert.match(home,/mouseleave/);
  assert.match(home,/matchMedia\("\(hover: none\), \(pointer: coarse\)"\)/);
  assert.match(home,/touchstart/);
  assert.match(home,/touchend/);
  assert.doesNotMatch(home,/product\.badge|<span class="badge">/);
  assert.match(css,/\.product-card-img/);
  assert.match(store,/PRODUCT_IMAGE_MANIFEST/);
});

test("catalogue image manifest maps every product to a shipped image",()=>{
  const store=fs.readFileSync(path.join(root,"frontend","src","scripts","store.js"),"utf8");
  const assets=path.join(root,"frontend","assets");
  const actual=new Set(fs.readdirSync(assets).map(name=>name.toLowerCase()));
  const manifest=store.match(/const PRODUCT_IMAGE_MANIFEST = Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(manifest,"product image manifest missing");
  const imageRefs=[...manifest[1].matchAll(/assets\/([^"']+?\.webp)/gi)].map(m=>m[1].toLowerCase());
  assert.ok(imageRefs.length >= 13,"manifest does not cover the full catalogue");
  assert.deepEqual([...new Set(imageRefs)].filter(name=>!actual.has(name)),[]);
});

test("asset references resolve to shipped frontend assets",()=>{
  const frontend=path.join(root,"frontend");
  const assets=path.join(frontend,"assets");
  const actual=new Set(fs.readdirSync(assets).map(name=>name.toLowerCase()));
  const files=[];
  const walk=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,entry.name);if(entry.isDirectory())walk(p);else if(/\.(html|js|css)$/i.test(entry.name))files.push(p);}};
  walk(frontend);
  const refs=new Set();
  const pattern=/assets\/([A-Za-z0-9_ .()\-]+\.(?:webp|png|jpg|jpeg|svg|gif))/gi;
  for(const file of files){
    const text=fs.readFileSync(file,"utf8");
    for(const match of text.matchAll(pattern)) refs.add(match[1].toLowerCase());
  }
  const intentionalLegacy=new Set([
    "straight cap black.webp","whatsapp image 2026-09-22 at 17.26.41.webp","zipper hoodie.webp","tshirt back.webp","tshirt front.webp","tshirtfront.webp","tshirtback.webp"
  ]);
  const missing=[...refs].filter(name=>!actual.has(name)&&!intentionalLegacy.has(name));
  assert.deepEqual(missing,[]);
});


test("product PATCH preserves omitted gallery data",()=>{
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  assert.match(server,/SELECT \* FROM products WHERE id=\$1/);
  assert.match(server,/validateProduct\(\{\.\.\.existing\.rows\[0\],\.\.\.req\.body/);
});

test("catalogue prices are locked to the requested values",()=>{
  const store=fs.readFileSync(path.join(root,"frontend","src","scripts","store.js"),"utf8");
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  for(const [id,price] of Object.entries({
    "hoodie-zip":400,"hoodie-white":400,"hoodie-blue":350,"hoodie-pink":350,
    "tee-signature":250,"tee-black":200,"tee-white":200,
    "trouser-black":400,"trouser-grey":400,"cap-001":100,"tote-001":120,"tote-002":120
  })){
    assert.match(store,new RegExp(`"${id}"\\s*:\\s*${price}`),`${id} frontend price lock missing`);
    assert.match(server,new RegExp(`"${id}"\\s*:\\s*${price}`),`${id} server price lock missing`);
  }
  assert.match(store,/catalogVersion = "12"/);
  assert.match(store,/canonicalProductPrice/);
  assert.match(require("fs").readFileSync(path.join(root,"frontend","src","scripts","home.js"),"utf8"),/normalizeProduct\(/);
  assert.match(server,/canonicalProductPrice\(v\.product_catalog_id/);
});


test("cart starts empty and never migrates a previous cart automatically",()=>{
  const store=fs.readFileSync(path.join(root,"frontend","src","scripts","store.js"),"utf8");
  const account=fs.readFileSync(path.join(root,"frontend","src","scripts","account.js"),"utf8");
  assert.match(store,/cart:\s*"dripcartel_cart_v2"/);
  assert.match(store,/legacyCart:\s*"dripcartel_cart_v1"/);
  assert.match(store,/localStorage\.setItem\(DRIP_STORAGE\.cart, "\[\]"\)/);
  assert.match(store,/localStorage\.removeItem\(DRIP_STORAGE\.legacyCart\)/);
  assert.match(store,/function saveCart\(cart\)/);
  assert.match(account,/dripcartel_cart_v2/);
});

test("security hardening is enabled",()=>{
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  assert.match(server,/rejectUnauthorized:\s*true/);
  assert.match(server,/TRUST_PROXY/);
  assert.match(server,/csrfTokenForSession/);
  assert.match(server,/x-csrf-token/);
  assert.match(server,/CSRF validation failed/);
  assert.match(server,/ADMIN_SETUP_TOKEN/);
});

test("shipping is database-backed and checkout uses configured rates",()=>{
  const schema=fs.readFileSync(path.join(root,"database","schema.sql"),"utf8");
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  const admin=fs.readFileSync(path.join(root,"frontend","src","scripts","admin.js"),"utf8");
  assert.match(schema,/CREATE TABLE IF NOT EXISTS store_settings/);
  assert.match(server,/SELECT standard_shipping FROM store_settings/);
  assert.match(server,/isWitbankEmalahleniArea/);
  assert.match(server,/calculateShippingTotal/);
  assert.match(server,/standard_shipping: 60/);
  assert.match(server,/\/api\/admin\/settings/);
  assert.match(admin,/saveShippingSettings/);
  assert.doesNotMatch(server,/subtotal>=1000\?0:79/);
});

test("refund and order cancellation keep inventory consistent",()=>{
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  assert.match(server,/order_refunded/);
  assert.match(server,/Process the full payment refund before marking this order refunded/);
});

test("reset tokens are not sent in query strings",()=>{
  const server=fs.readFileSync(path.join(root,"backend","server.js"),"utf8");
  const reset=fs.readFileSync(path.join(root,"frontend","src","scripts","reset-password.js"),"utf8");
  assert.match(server,/reset-password\.html#token=/);
  assert.match(reset,/location\.hash/);
  assert.doesNotMatch(server,/reset-password\.html\?token=/);
});


test("account-to-shop navigation includes the storefront page transition",()=>{
  const account=fs.readFileSync(path.join(root,"frontend","account.html"),"utf8");
  const common=fs.readFileSync(path.join(root,"frontend","src","scripts","common.js"),"utf8");
  assert.match(account,/id="transitionOverlay"/);
  assert.match(account,/href="index\.html"[^>]*data-transition/);
  assert.match(account,/href="index\.html#shop"[^>]*data-transition/);
  assert.match(common,/setupTransitions\(\)/);
  assert.match(common,/overlay\.classList\.add\("show"\)/);
});
