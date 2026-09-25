require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_ORIGIN = String(process.env.FRONTEND_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, "");
const DEFAULT_COUNTRY_CODE = String(process.env.DEFAULT_COUNTRY_CODE || "27").replace(/\D/g, "") || "27";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : (process.env.DATABASE_CA ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA } : { rejectUnauthorized: true }),
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000
});

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? true : (process.env.TRUST_PROXY ? process.env.TRUST_PROXY : false));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://paystack.com", "https://checkout.paystack.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "X-CSRF-Token"] }));
app.use(express.json({
  limit: "250kb",
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(cookieParser());

function csrfTokenForSession(sessionId) {
  return crypto.createHmac("sha256", process.env.AUTH_PEPPER || process.env.JWT_SECRET).update(`csrf:${sessionId}`).digest("hex");
}
function safeEqualString(a, b) {
  const aa = Buffer.from(String(a || "")); const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function csrfSessionFromRequest(req) {
  const customerToken = req.cookies.drip_customer;
  const adminToken = req.cookies.drip_admin;
  if (customerToken) {
    const payload = jwt.verify(customerToken, process.env.JWT_SECRET, { issuer: "dripcartel-api", audience: "dripcartel-customer" });
    if (payload.role !== "customer" || !payload.sid) throw new Error("Invalid customer session");
    const { rows } = await pool.query("SELECT id FROM customer_sessions WHERE id=$1 AND customer_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>NOW()", [payload.sid, payload.sub, hashSecret(payload.sid)]);
    if (!rows.length) throw new Error("Expired customer session");
    return payload.sid;
  }
  if (adminToken) {
    const payload = jwt.verify(adminToken, process.env.JWT_SECRET, { issuer: "dripcartel-api", audience: "dripcartel-admin" });
    if (payload.role !== "admin" || !payload.sid) throw new Error("Invalid admin session");
    const { rows } = await pool.query("SELECT id FROM admin_sessions WHERE id=$1 AND admin_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>NOW()", [payload.sid, payload.sub, hashSecret(payload.sid)]);
    if (!rows.length) throw new Error("Expired admin session");
    return payload.sid;
  }
  return null;
}

app.get("/api/auth/csrf", async (req, res) => {
  try {
    const sid = await csrfSessionFromRequest(req);
    if (!sid) return res.status(401).json({ error: "Authentication required." });
    res.set("Cache-Control", "no-store");
    return res.json({ token: csrfTokenForSession(sid) });
  } catch { return res.status(401).json({ error: "Authentication required." }); }
});


const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many authentication attempts. Try again later." } });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many verification requests. Please wait before trying again." } });
const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many checkout attempts. Please try again shortly." } });
const adminDiscoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many private-access attempts. Please try again later." } });

function isAllowedOrigin(req) {
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (origin) return origin === FRONTEND_ORIGIN;
  if (referer) return referer.startsWith(`${FRONTEND_ORIGIN}/`);
  return true;
}
app.use("/api", async (req,res,next)=>{
  if(["POST","PUT","PATCH","DELETE"].includes(req.method)&&!req.path.startsWith("/payments/paystack/webhook")){
    if(!isAllowedOrigin(req)) return res.status(403).json({error:"Request origin is not allowed."});
    const hasSession=Boolean(req.cookies.drip_customer||req.cookies.drip_admin);
    const exempt=["/auth/register","/auth/verify-whatsapp","/auth/resend-verification","/auth/forgot-password","/auth/reset-password","/auth/login","/admin/discover","/admin/setup","/admin/login"].includes(req.path);
    if(hasSession&&!exempt){try{const sid=await csrfSessionFromRequest(req);if(!sid||!safeEqualString(req.get("x-csrf-token"),csrfTokenForSession(sid)))return res.status(403).json({error:"CSRF validation failed."});}catch{return res.status(403).json({error:"CSRF validation failed."});}}
  }
  next();
});

function normalizePhone(value) {
  let raw = String(value || "").trim().replace(/[()\s.-]/g, "");
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return `+${digits}`;
  if (digits.startsWith("0")) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}
function isValidPhone(phone) { return /^\+[1-9]\d{7,14}$/.test(phone); }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function hashSecret(value) { return crypto.createHmac("sha256", process.env.AUTH_PEPPER || process.env.JWT_SECRET).update(String(value)).digest("hex"); }
function createOtp() { return String(crypto.randomInt(100000, 1000000)); }
function createResetToken() { return crypto.randomBytes(32).toString("hex"); }
function safeText(value, max = 2000) { return String(value || "").trim().slice(0, max); }
function escapeHtml(value) { return String(value).replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }

function cookieSameSite() {
  const value = String(process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  return ["lax", "strict", "none"].includes(value) ? value : "lax";
}
function customerCookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: cookieSameSite(), maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" }; }
function adminCookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: cookieSameSite(), maxAge: 2 * 60 * 60 * 1000, path: "/" }; }
function signCustomerToken(account, sessionId) { return jwt.sign({ sub: account.id, role: "customer", email: account.email, sid: sessionId }, process.env.JWT_SECRET, { expiresIn: "7d", issuer: "dripcartel-api", audience: "dripcartel-customer" }); }
function signAdminToken(admin, sessionId) { return jwt.sign({ sub: admin.id, role: "admin", email: admin.email, sid: sessionId }, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "dripcartel-api", audience: "dripcartel-admin" }); }
async function createSession(customerId, userAgent, ip) {
  const sessionId = crypto.randomUUID();
  const tokenHash = hashSecret(sessionId);
  await pool.query(`INSERT INTO customer_sessions (id, customer_id, token_hash, user_agent, ip_address, expires_at) VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '7 days')`, [sessionId, customerId, tokenHash, safeText(userAgent, 500), ip || null]);
  return sessionId;
}
async function createAdminSession(adminId, userAgent, ip) {
  const sessionId = crypto.randomUUID();
  await pool.query(`INSERT INTO admin_sessions (id, admin_id, token_hash, user_agent, ip_address, expires_at) VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '2 hours')`, [sessionId, adminId, hashSecret(sessionId), safeText(userAgent, 500), ip || null]);
  return sessionId;
}

async function requireCustomer(req, res, next) {
  const token = req.cookies.drip_customer;
  if (!token) return res.status(401).json({ error: "Customer authentication required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: "dripcartel-api", audience: "dripcartel-customer" });
    if (payload.role !== "customer" || !payload.sid) throw new Error("Invalid session");
    const { rows } = await pool.query(`SELECT s.id, s.customer_id, s.expires_at, c.status, c.email_verified FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.id=$1 AND s.customer_id=$2 AND s.token_hash=$3 AND s.revoked_at IS NULL AND s.expires_at>NOW()`, [payload.sid, payload.sub, hashSecret(payload.sid)]);
    if (!rows.length || rows[0].status !== "active" || !rows[0].email_verified) throw new Error("Session revoked");
    req.customer = payload;
    next();
  } catch {
    res.clearCookie("drip_customer", customerCookieOptions());
    return res.status(401).json({ error: "Customer session expired. Please sign in again." });
  }
}
async function requireAdmin(req, res, next) {
  const token = req.cookies.drip_admin;
  if (!token) return res.status(401).json({ error: "Administrator authentication required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: "dripcartel-api", audience: "dripcartel-admin" });
    if (payload.role !== "admin" || !payload.sid) throw new Error("Invalid session");
    const { rows } = await pool.query(`SELECT id FROM admin_sessions WHERE id=$1 AND admin_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>NOW()`, [payload.sid, payload.sub, hashSecret(payload.sid)]);
    if (!rows.length) throw new Error("Session revoked");
    req.admin = payload;
    next();
  } catch {
    res.clearCookie("drip_admin", adminCookieOptions());
    return res.status(401).json({ error: "Administrator session expired. Please sign in again." });
  }
}

async function audit(actorType, actorId, action, req, metadata = {}) {
  try { await pool.query(`INSERT INTO audit_logs (actor_type, actor_id, action, ip_address, user_agent, metadata) VALUES ($1,$2,$3,$4,$5,$6)`, [actorType, actorId || null, action, req.ip || null, safeText(req.get("user-agent"), 500), JSON.stringify(metadata)]); } catch (err) { console.error("AUDIT_LOG_FAILED", err.message); }
}

async function sendWhatsAppTemplate(to, templateName, languageCode, parameters) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "console").toLowerCase();
  if (provider === "console") { console.log(`[WHATSAPP:console] to=${to} template=${templateName} params=${parameters.join("|")}`); return; }
  if (provider !== "meta") throw new Error("Unsupported WhatsApp provider.");
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API is not configured.");
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: templateName, language: { code: languageCode || "en_US" }, components: [{ type: "body", parameters: parameters.map(text => ({ type: "text", text: String(text) })) }] } })
  });
  if (!response.ok) throw new Error(`WhatsApp provider rejected message: ${response.status} ${(await response.text()).slice(0, 300)}`);
}
async function sendOtpWhatsApp(account, otp) {
  await sendWhatsAppTemplate(account.phone, process.env.WHATSAPP_OTP_TEMPLATE || "dripcartel_verify", process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US", [account.firstName, otp]);
}
async function sendResetWhatsApp(account, token) {
  const base = FRONTEND_ORIGIN;
  const url = `${base}/reset-password.html#token=${encodeURIComponent(token)}`;
  await sendWhatsAppTemplate(account.phone, process.env.WHATSAPP_RESET_TEMPLATE || "dripcartel_password_reset", process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US", [account.firstName, url]);
}

async function sendEmail({ to, subject, html, text }) {
  const provider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (!provider) return;
  if (provider === "console") { console.log(`[EMAIL:console] to=${to} subject=${subject}\n${text}`); return; }
  if (provider !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email service is not configured.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }) });
  if (!response.ok) throw new Error(`Email provider rejected message: ${response.status}`);
}

app.get("/api/health", async (_req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true, service: "dripcartel-api" }); } catch { res.status(503).json({ ok: false }); } });

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const firstName = safeText(req.body.firstName, 80), lastName = safeText(req.body.lastName, 80), email = normalizeEmail(req.body.email), phone = normalizePhone(req.body.phone), password = String(req.body.password || "");
  if (firstName.length < 2 || lastName.length < 2) return res.status(400).json({ error: "Enter your first and last name." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!isValidPhone(phone)) return res.status(400).json({ error: "Enter a valid WhatsApp number in international format, e.g. +27 82 123 4567." });
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ error: "Password must be at least 10 characters and include uppercase, lowercase, number and special character." });
  try {
    const existing = await pool.query(`SELECT id,email,phone,email_verified,status FROM customer_accounts WHERE email=$1 OR phone=$2 LIMIT 1`, [email, phone]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.email === email && !row.email_verified) return res.status(409).json({ error: "An account already exists with that email. Request a new WhatsApp verification code.", code: "NOT_VERIFIED" });
      return res.status(409).json({ error: row.phone === phone ? "An account already exists with that WhatsApp number." : "An account already exists with that email address." });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(`INSERT INTO customer_accounts (first_name,last_name,email,phone,password_hash,email_verified,status) VALUES ($1,$2,$3,$4,$5,FALSE,'pending_verification') RETURNING id,first_name AS "firstName",last_name AS "lastName",email,phone,created_at AS "createdAt"`, [firstName,lastName,email,phone,hash]);
    const account = rows[0];
    const otp = createOtp();
    await pool.query("DELETE FROM whatsapp_verification_codes WHERE customer_id=$1", [account.id]);
    await pool.query("INSERT INTO whatsapp_verification_codes (customer_id,code_hash,expires_at,attempts) VALUES ($1,$2,NOW()+INTERVAL '10 minutes',0)", [account.id, hashSecret(otp)]);
    try { await sendOtpWhatsApp(account, otp); } catch (err) { console.error("WHATSAPP_OTP_FAILED", err.message); return res.status(503).json({ error: "Your account was created, but we could not send the WhatsApp verification code. Check the number and try again shortly." }); }
    await audit("customer", account.id, "customer.registered", req, { verificationChannel: "whatsapp" });
    res.status(202).json({ message: "Account created. Check WhatsApp for your 6-digit verification code.", pending: true, phone: account.phone });
  } catch (err) { if (err.code === "23505") return res.status(409).json({ error: "An account already exists with these details." }); console.error(err); res.status(500).json({ error: "Could not create your account." }); }
});

app.post("/api/auth/verify-whatsapp", otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body.phone), code = String(req.body.code || "").trim();
  if (!isValidPhone(phone) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the WhatsApp number and the 6-digit code." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountResult = await client.query(`SELECT id,first_name AS "firstName",last_name AS "lastName",email,phone,created_at AS "createdAt",email_verified,status FROM customer_accounts WHERE phone=$1 FOR UPDATE`, [phone]);
    if (!accountResult.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "We could not verify that account." }); }
    const account = accountResult.rows[0];
    if (account.email_verified || account.status === "active") { await client.query("COMMIT"); return res.status(200).json({ message: "Your WhatsApp number is already verified." }); }
    const codeResult = await client.query("SELECT id,code_hash,expires_at,attempts FROM whatsapp_verification_codes WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [account.id]);
    if (!codeResult.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Your verification code has expired. Request a new code." }); }
    const record = codeResult.rows[0];
    if (new Date(record.expires_at).getTime() < Date.now()) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Your verification code has expired. Request a new code." }); }
    if (record.attempts >= 5) { await client.query("ROLLBACK"); return res.status(429).json({ error: "Too many incorrect codes. Request a new WhatsApp code." }); }
    if (!crypto.timingSafeEqual(Buffer.from(hashSecret(code)), Buffer.from(record.code_hash))) { await client.query("UPDATE whatsapp_verification_codes SET attempts=attempts+1 WHERE id=$1", [record.id]); await client.query("COMMIT"); return res.status(400).json({ error: "That verification code is incorrect." }); }
    await client.query("UPDATE customer_accounts SET email_verified=TRUE,status='active',email_verified_at=NOW(),updated_at=NOW() WHERE id=$1", [account.id]);
    await client.query("DELETE FROM whatsapp_verification_codes WHERE customer_id=$1", [account.id]);
    await client.query("COMMIT");
    const sessionId = await createSession(account.id, req.get("user-agent"), req.ip);
    delete account.email_verified; delete account.status;
    res.cookie("drip_customer", signCustomerToken(account, sessionId), customerCookieOptions());
    await audit("customer", account.id, "customer.verified_whatsapp", req, { channel: "whatsapp" });
    res.json({ message: "WhatsApp verified. Your account is ready.", account });
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); console.error(err); res.status(500).json({ error: "Could not verify your WhatsApp number." }); } finally { client.release(); }
});

app.post("/api/auth/resend-verification", otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!isValidPhone(phone)) return res.status(400).json({ error: "Enter a valid WhatsApp number." });
  try {
    const { rows } = await pool.query(`SELECT id,first_name AS "firstName",email,phone,email_verified,status FROM customer_accounts WHERE phone=$1 LIMIT 1`, [phone]);
    if (!rows.length || rows[0].email_verified) return res.json({ message: "If an unverified account exists for that WhatsApp number, a new code has been sent." });
    const account = rows[0], otp = createOtp();
    await pool.query("DELETE FROM whatsapp_verification_codes WHERE customer_id=$1", [account.id]);
    await pool.query("INSERT INTO whatsapp_verification_codes (customer_id,code_hash,expires_at,attempts) VALUES ($1,$2,NOW()+INTERVAL '10 minutes',0)", [account.id, hashSecret(otp)]);
    await sendOtpWhatsApp(account, otp);
    res.json({ message: "If an unverified account exists for that WhatsApp number, a new code has been sent." });
  } catch (err) { console.error(err); res.status(503).json({ error: "We could not send a new WhatsApp code right now." }); }
});

app.post("/api/auth/forgot-password", otpLimiter, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const generic = "If an active account exists for that WhatsApp number, reset instructions have been sent.";
  if (!isValidPhone(phone)) return res.status(400).json({ error: "Enter a valid WhatsApp number." });
  try {
    const { rows } = await pool.query(`SELECT id,first_name AS "firstName",email,phone,email_verified,status FROM customer_accounts WHERE phone=$1 LIMIT 1`, [phone]);
    if (!rows.length || !rows[0].email_verified || rows[0].status !== "active") return res.json({ message: generic });
    const account = rows[0], token = createResetToken();
    await pool.query("DELETE FROM password_reset_tokens WHERE customer_id=$1", [account.id]);
    await pool.query("INSERT INTO password_reset_tokens (customer_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 minutes')", [account.id, hashSecret(token)]);
    await sendResetWhatsApp(account, token);
    res.json({ message: generic });
  } catch (err) { console.error(err); res.json({ message: generic }); }
});

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  const token = String(req.body.token || ""), password = String(req.body.password || "");
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: "Invalid or expired reset link." });
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(400).json({ error: "Password must be at least 10 characters and include uppercase, lowercase, number and special character." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT t.id,t.customer_id,c.email FROM password_reset_tokens t JOIN customer_accounts c ON c.id=t.customer_id WHERE t.token_hash=$1 AND t.expires_at>NOW() FOR UPDATE`, [hashSecret(token)]);
    if (!result.rows.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Invalid or expired reset link." }); }
    const hash = await bcrypt.hash(password, 12), accountId = result.rows[0].customer_id;
    await client.query("UPDATE customer_accounts SET password_hash=$1,updated_at=NOW() WHERE id=$2", [hash, accountId]);
    await client.query("DELETE FROM password_reset_tokens WHERE customer_id=$1", [accountId]);
    await client.query("UPDATE customer_sessions SET revoked_at=NOW() WHERE customer_id=$1 AND revoked_at IS NULL", [accountId]);
    await client.query("COMMIT");
    await audit("customer", accountId, "customer.password_reset", req);
    res.json({ message: "Password updated. Please sign in again." });
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); console.error(err); res.status(500).json({ error: "Could not reset your password." }); } finally { client.release(); }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email), password = String(req.body.password || "");
  if (!isValidEmail(email) || !password) return res.status(400).json({ error: "Email and password are required." });
  const { rows } = await pool.query(`SELECT id,first_name AS "firstName",last_name AS "lastName",email,phone,password_hash,created_at AS "createdAt",email_verified,status,failed_login_count,locked_until FROM customer_accounts WHERE email=$1 LIMIT 1`, [email]);
  const generic = "Invalid email or password.";
  if (!rows.length) { await audit("anonymous", null, "customer.login_failed", req, { reason: "unknown_account" }); return res.status(401).json({ error: generic }); }
  const account = rows[0];
  if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) return res.status(429).json({ error: "Too many failed attempts. Please try again later." });
  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) {
    const nextCount = Number(account.failed_login_count || 0) + 1;
    const lock = nextCount >= 7 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await pool.query("UPDATE customer_accounts SET failed_login_count=$1,locked_until=$2 WHERE id=$3", [lock ? 0 : nextCount, lock, account.id]);
    await audit("customer", account.id, "customer.login_failed", req, { reason: "bad_password" });
    return res.status(401).json({ error: generic });
  }
  if (!account.email_verified || account.status !== "active") return res.status(403).json({ error: "Please verify your WhatsApp number before signing in.", code: "NOT_VERIFIED", phone: account.phone });
  await pool.query("UPDATE customer_accounts SET failed_login_count=0,locked_until=NULL WHERE id=$1", [account.id]);
  const sessionId = await createSession(account.id, req.get("user-agent"), req.ip);
  const { password_hash, email_verified, status, failed_login_count, locked_until, ...safeAccount } = account;
  res.cookie("drip_customer", signCustomerToken(safeAccount, sessionId), customerCookieOptions());
  await audit("customer", account.id, "customer.login_success", req);
  res.json({ account: safeAccount });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.cookies.drip_customer;
  if (token) { try { const payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: "dripcartel-api", audience: "dripcartel-customer" }); if (payload.sid) await pool.query("UPDATE customer_sessions SET revoked_at=NOW() WHERE id=$1", [payload.sid]); } catch {} }
  res.clearCookie("drip_customer", customerCookieOptions()); res.json({ message: "Signed out." });
});
app.get("/api/auth/me", requireCustomer, async (req, res) => { const { rows } = await pool.query(`SELECT id,first_name AS "firstName",last_name AS "lastName",email,phone,created_at AS "createdAt" FROM customer_accounts WHERE id=$1 AND email_verified=TRUE AND status='active'`, [req.customer.sub]); if (!rows.length) return res.status(404).json({ error: "Account not found." }); res.json({ account: rows[0] }); });
app.get("/api/auth/sessions", requireCustomer, async (req, res) => { const { rows } = await pool.query(`SELECT id,created_at AS "createdAt",last_seen_at AS "lastSeenAt",user_agent AS "userAgent",ip_address AS "ipAddress",expires_at AS "expiresAt" FROM customer_sessions WHERE customer_id=$1 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC`, [req.customer.sub]); res.json({ sessions: rows.map(x => ({ ...x, ipAddress: process.env.EXPOSE_SESSION_IP === "true" ? x.ipAddress : undefined })) }); });
app.delete("/api/auth/sessions/:id", requireCustomer, async (req, res) => { const result = await pool.query("UPDATE customer_sessions SET revoked_at=NOW() WHERE id=$1 AND customer_id=$2", [req.params.id, req.customer.sub]); if (!result.rowCount) return res.status(404).json({ error: "Session not found." }); res.json({ message: "Session revoked." }); });
app.patch("/api/auth/profile", requireCustomer, async (req, res) => { const firstName=safeText(req.body.firstName,80),lastName=safeText(req.body.lastName,80); if(firstName.length<2||lastName.length<2)return res.status(400).json({error:"Enter a valid first and last name."}); const {rows}=await pool.query(`UPDATE customer_accounts SET first_name=$1,last_name=$2,updated_at=NOW() WHERE id=$3 RETURNING id,first_name AS "firstName",last_name AS "lastName",email,phone,created_at AS "createdAt"`,[firstName,lastName,req.customer.sub]); res.json({account:rows[0]}); });

app.post("/api/admin/discover", adminDiscoveryLimiter, async (req,res)=>{
  const supplied=String(req.body?.code||"").trim();
  const configured=String(process.env.ADMIN_DISCOVERY_CODE||"").trim();
  if(!configured || supplied.length<6 || supplied.length>128) return res.status(404).json({unlocked:false});
  const a=Buffer.from(supplied);
  const b=Buffer.from(configured);
  const valid=a.length===b.length && crypto.timingSafeEqual(a,b);
  if(!valid){ await audit("anonymous",null,"admin.discovery_failed",req); return res.status(404).json({unlocked:false}); }
  await audit("anonymous",null,"admin.discovery_unlocked",req);
  res.json({unlocked:true});
});

app.get("/api/admin/status", async (_req,res)=>{ const {rows}=await pool.query("SELECT EXISTS(SELECT 1 FROM admin_accounts) AS configured"); res.json({configured:rows[0].configured}); });
app.post("/api/admin/setup", authLimiter, async (req,res)=>{
  if (!process.env.ADMIN_SETUP_TOKEN) return res.status(403).json({error:"Administrator bootstrap is disabled until ADMIN_SETUP_TOKEN is configured."});
  if (process.env.ADMIN_SETUP_TOKEN && req.get("x-admin-setup-token") !== process.env.ADMIN_SETUP_TOKEN) return res.status(403).json({error:"Administrator bootstrap is locked."});
  const email=normalizeEmail(req.body.email),password=String(req.body.password||"");
  if(!isValidEmail(email))return res.status(400).json({error:"Enter a valid email address."});
  if(password.length<12||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/\d/.test(password)||!/[^A-Za-z0-9]/.test(password))return res.status(400).json({error:"Password must be at least 12 characters and include uppercase, lowercase, number and special character."});
  const client=await pool.connect(); try { await client.query("BEGIN"); const existing=await client.query("SELECT id FROM admin_accounts FOR UPDATE"); if(existing.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Administrator account is already configured."});} const hash=await bcrypt.hash(password,12); const result=await client.query("INSERT INTO admin_accounts(id,email,password_hash) VALUES(1,$1,$2) RETURNING id,email",[email,hash]); await client.query("COMMIT"); const admin=result.rows[0],sid=await createAdminSession(admin.id,req.get("user-agent"),req.ip); res.cookie("drip_admin",signAdminToken(admin,sid),adminCookieOptions()); await audit("admin",admin.id,"admin.bootstrap",req); res.status(201).json({message:"Administrator account created.",admin:{email:admin.email}}); } catch(err){await client.query("ROLLBACK").catch(()=>{});console.error(err);res.status(500).json({error:"Could not create administrator account."});} finally{client.release();}
});
app.post("/api/admin/login", authLimiter, async (req,res)=>{const email=normalizeEmail(req.body.email),password=String(req.body.password||"");const {rows}=await pool.query("SELECT id,email,password_hash FROM admin_accounts WHERE id=1 LIMIT 1");if(!rows.length)return res.status(428).json({error:"First-run setup is required."});const valid=await bcrypt.compare(password,rows[0].password_hash);if(!valid||email!==rows[0].email){await audit("anonymous",null,"admin.login_failed",req,{email});return res.status(401).json({error:"Invalid administrator credentials."});}const sid=await createAdminSession(rows[0].id,req.get("user-agent"),req.ip);res.cookie("drip_admin",signAdminToken(rows[0],sid),adminCookieOptions());await audit("admin",rows[0].id,"admin.login_success",req);res.json({message:"Signed in.",admin:{email:rows[0].email}});});
app.post("/api/admin/logout",async(req,res)=>{const token=req.cookies.drip_admin;if(token){try{const p=jwt.verify(token,process.env.JWT_SECRET,{issuer:"dripcartel-api",audience:"dripcartel-admin"});if(p.sid)await pool.query("UPDATE admin_sessions SET revoked_at=NOW() WHERE id=$1",[p.sid]);}catch{}}res.clearCookie("drip_admin",adminCookieOptions());res.json({message:"Signed out."});});
app.get("/api/admin/me",requireAdmin,async(_req,res)=>{const {rows}=await pool.query("SELECT id,email,created_at FROM admin_accounts WHERE id=1");if(!rows.length)return res.status(401).json({error:"Administrator account not found."});res.json({admin:{email:rows[0].email,createdAt:rows[0].created_at}});});

const LOCKED_PRODUCT_PRICES = Object.freeze({
  "hoodie-original": 350, "hoodie-blue": 350, "hoodie-pink": 350,
  "hoodie-zip": 400, "hoodie-white": 400,
  "tee-signature": 250, "tee-black": 200, "tee-white": 200,
  "trouser-black": 400, "trouser-grey": 400,
  "cap-001": 100, "tote-001": 120, "tote-002": 120
});
function canonicalProductPrice(id, name, category, fallback){
  if(Object.prototype.hasOwnProperty.call(LOCKED_PRODUCT_PRICES,id)) return LOCKED_PRODUCT_PRICES[id];
  if(category === "Hoodies" && /\b(zip|zipper)\b/i.test(`${id || ""} ${name || ""}`)) return 400;
  return Number(fallback);
}

function validateProduct(body){const id=String(body.id||"").trim(),name=safeText(body.name,120),category=safeText(body.category,60),requestedPrice=Number(body.price),price=canonicalProductPrice(id,name,category,requestedPrice),stock=Number(body.stock);if(!/^[a-zA-Z0-9_-]{2,80}$/.test(id))return{ok:false,error:"Invalid product ID."};if(!name)return{ok:false,error:"Product name is required."};if(!category)return{ok:false,error:"Product category is required."};if(!Number.isFinite(price)||price<0||price>1000000)return{ok:false,error:"Invalid product price."};if(!Number.isInteger(stock)||stock<0||stock>1000000)return{ok:false,error:"Invalid stock quantity."};const sizes=Array.isArray(body.sizes)?body.sizes.map(x=>safeText(x,30)).filter(Boolean).slice(0,20):[];if(sizes.some(size=>!["S","M","L"].includes(size)))return{ok:false,error:"Clothing sizes are limited to S, M and L."};const colours=Array.isArray(body.colours)?body.colours.map(x=>safeText(x,30)).filter(Boolean).slice(0,20):[];const gallery=Array.isArray(body.gallery)?body.gallery.map(x=>safeText(x,500)).filter(Boolean).slice(0,8):[];return{ok:true,value:{id,name,category,price,stock,sizes,colours,gallery,description:safeText(body.description,2000),image:safeText(body.image,500),badge:safeText(body.badge,50)}};}
app.get("/api/products",async(_req,res)=>{const{rows}=await pool.query("SELECT id,name,category,price,stock,sizes,colours,description,image,gallery,badge FROM products ORDER BY created_at DESC");res.json(rows.map(row=>({...row,price:canonicalProductPrice(row.id,row.name,row.category,row.price)})));});
app.post("/api/products",requireAdmin,async(req,res)=>{const p=validateProduct(req.body);if(!p.ok)return res.status(400).json({error:p.error});try{const{rows}=await pool.query(`INSERT INTO products(id,name,category,price,stock,sizes,colours,description,image,gallery,badge) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[p.value.id,p.value.name,p.value.category,p.value.price,p.value.stock,p.value.sizes,p.value.colours,p.value.description,p.value.image,p.value.gallery,p.value.badge]);await audit("admin",req.admin.sub,"product.created",req,{productId:p.value.id});res.status(201).json(rows[0]);}catch(err){if(err.code==="23505")return res.status(409).json({error:"Product ID already exists."});throw err;}});
app.patch("/api/products/:id",requireAdmin,async(req,res)=>{const existing=await pool.query("SELECT * FROM products WHERE id=$1",[req.params.id]);if(!existing.rows.length)return res.status(404).json({error:"Product not found."});const p=validateProduct({...existing.rows[0],...req.body,id:req.params.id});if(!p.ok)return res.status(400).json({error:p.error});const{rows}=await pool.query(`UPDATE products SET name=$2,category=$3,price=$4,stock=$5,sizes=$6,colours=$7,description=$8,image=$9,gallery=$10,badge=$11,updated_at=NOW() WHERE id=$1 RETURNING *`,[p.value.id,p.value.name,p.value.category,p.value.price,p.value.stock,p.value.sizes,p.value.colours,p.value.description,p.value.image,p.value.gallery,p.value.badge]);await audit("admin",req.admin.sub,"product.updated",req,{productId:p.value.id});res.json(rows[0]);});
app.delete("/api/products/:id",requireAdmin,async(req,res)=>{const result=await pool.query("DELETE FROM products WHERE id=$1",[req.params.id]);if(!result.rowCount)return res.status(404).json({error:"Product not found."});await audit("admin",req.admin.sub,"product.deleted",req,{productId:req.params.id});res.status(204).end();});

function orderNumber(){return `DC-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;}

function normalizeSouthAfricanPostalCode(value){return /^\d{4}$/.test(String(value||''));}
function normalizeAddress(input={}){return {recipientName:safeText(input.recipientName,160),street:safeText(input.street,180),city:safeText(input.city,100),province:safeText(input.province,100),postalCode:safeText(input.postalCode,20),country:safeText(input.country||'ZA',10)}}
function isWitbankEmalahleniArea(city){
  const normalized=String(city||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  return normalized==='witbank'||normalized==='emalahleni';
}
function calculateShippingTotal(address,standardShipping=60){
  return isWitbankEmalahleniArea(address?.city) ? 0 : Number(standardShipping);
}

app.post("/api/orders", requireCustomer, checkoutLimiter, async (req,res)=>{
  const storeState=await pool.query("SELECT store_status FROM store_settings WHERE id=1");
  if(storeState.rows[0]?.store_status==='closed') return res.status(503).json({error:"The store is temporarily closed for new orders."});
  const items=Array.isArray(req.body.items)?req.body.items:[];
  const address=normalizeAddress(req.body.address);
  if(!items.length||items.length>50)return res.status(400).json({error:"Your cart is empty or too large."});
  if(!address.recipientName||!address.street||!address.city||!address.province||!normalizeSouthAfricanPostalCode(address.postalCode))return res.status(400).json({error:"Enter a complete South African delivery address with a 4-digit postal code."});
  const idempotencyKey=safeText(req.get("idempotency-key"),120);if(!idempotencyKey)return res.status(400).json({error:"Checkout request is missing an idempotency key."});
  const existingOrder=await pool.query("SELECT id,order_number AS \"orderNumber\",status,subtotal,shipping_total AS \"shippingTotal\",total,currency,created_at AS \"createdAt\" FROM orders WHERE customer_id=$1 AND idempotency_key=$2 LIMIT 1",[req.customer.sub,idempotencyKey]);
  if(existingOrder.rows.length)return res.status(200).json({order:existingOrder.rows[0],replayed:true});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const expired=await client.query(`SELECT id FROM orders WHERE status='pending_payment' AND reservation_expires_at IS NOT NULL AND reservation_expires_at<NOW() FOR UPDATE`);
    for(const expiredOrder of expired.rows){
      const lines=await client.query("SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=$1",[expiredOrder.id]);
      for(const line of lines.rows){
        if(line.variant_id){await client.query("UPDATE product_variants SET stock=stock+$1,updated_at=NOW() WHERE id=$2",[line.quantity,line.variant_id]);}
        await client.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2",[line.quantity,line.product_id]);
        await client.query(`INSERT INTO inventory_movements(product_id,variant_id,quantity,reason,reference_id) VALUES($1,$2,$3,'reservation_expired',$4)`,[line.product_id,line.variant_id,line.quantity,expiredOrder.id]);
      }
      await client.query("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1",[expiredOrder.id]);
    }
    const normalized=[];let subtotal=0;
    for(const raw of items){
      const id=safeText(raw.id,80),size=safeText(raw.size,30)||"One Size",colour=safeText(raw.colour,60)||"Default",qty=Number(raw.qty);
      if(!Number.isInteger(qty)||qty<1||qty>20)throw Object.assign(new Error("Invalid quantity."),{status:400});
      const vr=await client.query(`SELECT v.id AS variant_id,v.product_id,p.id AS product_catalog_id,p.name,p.category,COALESCE(v.price,p.price) AS price,v.stock FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.product_id=$1 AND v.size=$2 AND v.colour=$3 FOR UPDATE`,[id,size,colour]);
      let v=vr.rows[0];
      if(!v){const fallback=await client.query(`SELECT v.id AS variant_id,v.product_id,p.id AS product_catalog_id,p.name,p.category,COALESCE(v.price,p.price) AS price,v.stock FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.product_id=$1 AND v.size=$2 ORDER BY v.created_at LIMIT 1 FOR UPDATE`,[id,size]);v=fallback.rows[0];}
      if(!v)throw Object.assign(new Error(`The selected ${size} / ${colour} option is unavailable.`),{status:409});
      if(v.stock<qty)throw Object.assign(new Error(`${v.name} does not have enough stock in the selected variant.`),{status:409});
      const unitPrice=canonicalProductPrice(v.product_catalog_id,v.name,v.category,v.price);const line=Number(unitPrice)*qty;subtotal+=line;normalized.push({productId:v.product_id,variantId:v.variant_id,name:v.name,size,colour,qty,unitPrice:Number(unitPrice),lineTotal:line});
    }
    // Location-based South African delivery. Local Witbank/eMalahleni delivery is free;
    // all other destinations are charged the configured standard delivery fee.
    const shippingSettings = await client.query("SELECT standard_shipping FROM store_settings WHERE id=1");
    const shippingConfig = shippingSettings.rows[0] || { standard_shipping: 60 };
    const shippingTotal = calculateShippingTotal(address, Number(shippingConfig.standard_shipping) || 60);
    const total=subtotal+shippingTotal;
    const number=orderNumber();
    const {rows:orders}=await client.query(`INSERT INTO orders(order_number,idempotency_key,customer_id,status,subtotal,shipping_total,total,currency,shipping_address,reservation_expires_at) VALUES($1,$2,$3,'pending_payment',$4,$5,$6,'ZAR',$7,NOW()+INTERVAL '30 minutes') RETURNING id,order_number AS "orderNumber",status,subtotal,shipping_total AS "shippingTotal",total,currency,created_at AS "createdAt"`,[number,idempotencyKey,req.customer.sub,subtotal,shippingTotal,total,JSON.stringify(address)]);
    const order=orders[0];
    for(const item of normalized){
      await client.query(`INSERT INTO order_items(order_id,product_id,variant_id,product_name,size,colour,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[order.id,item.productId,item.variantId,item.name,item.size,item.colour,item.qty,item.unitPrice,item.lineTotal]);
      await client.query("UPDATE product_variants SET stock=stock-$1,updated_at=NOW() WHERE id=$2",[item.qty,item.variantId]);
      await client.query("UPDATE products SET stock=GREATEST(stock-$1,0),updated_at=NOW() WHERE id=$2",[item.qty,item.productId]);
      await client.query(`INSERT INTO inventory_movements(product_id,variant_id,quantity,reason,reference_id) VALUES($1,$2,$3,'order_reservation',$4)`,[item.productId,item.variantId,-item.qty,order.id]);
    }
    await client.query("COMMIT");await audit("customer",req.customer.sub,"order.created",req,{orderId:order.id,orderNumber:number,total,shippingTotal});res.status(201).json({order});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});console.error(err);res.status(err.status||500).json({error:err.status?err.message:"Could not create your order."});}finally{client.release();}
});

app.get("/api/addresses",requireCustomer,async(req,res)=>{const{rows}=await pool.query(`SELECT id,label,recipient_name AS "recipientName",street,city,province,postal_code AS "postalCode",country,is_default AS "isDefault",created_at AS "createdAt" FROM addresses WHERE customer_id=$1 ORDER BY is_default DESC,created_at DESC`,[req.customer.sub]);res.json({addresses:rows});});
app.post("/api/addresses",requireCustomer,async(req,res)=>{const a=normalizeAddress(req.body);const label=safeText(req.body.label||'Delivery',50);if(!a.recipientName||!a.street||!a.city||!a.province||!normalizeSouthAfricanPostalCode(a.postalCode))return res.status(400).json({error:'Complete the delivery address.'});const client=await pool.connect();try{await client.query('BEGIN');if(req.body.isDefault)await client.query('UPDATE addresses SET is_default=false WHERE customer_id=$1',[req.customer.sub]);const{rows}=await client.query(`INSERT INTO addresses(customer_id,label,recipient_name,street,city,province,postal_code,country,is_default) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,label,recipient_name AS "recipientName",street,city,province,postal_code AS "postalCode",country,is_default AS "isDefault"`,[req.customer.sub,label,a.recipientName,a.street,a.city,a.province,a.postalCode,a.country,Boolean(req.body.isDefault)]);await client.query('COMMIT');res.status(201).json({address:rows[0]});}catch(e){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Could not save address.'});}finally{client.release();}});
app.patch("/api/addresses/:id",requireCustomer,async(req,res)=>{const a=normalizeAddress(req.body);const label=safeText(req.body.label||'Delivery',50);if(!a.recipientName||!a.street||!a.city||!a.province||!normalizeSouthAfricanPostalCode(a.postalCode))return res.status(400).json({error:'Complete the delivery address.'});const client=await pool.connect();try{await client.query('BEGIN');if(req.body.isDefault)await client.query('UPDATE addresses SET is_default=false WHERE customer_id=$1',[req.customer.sub]);const{rows}=await client.query(`UPDATE addresses SET label=$1,recipient_name=$2,street=$3,city=$4,province=$5,postal_code=$6,country=$7,is_default=$8,updated_at=NOW() WHERE id=$9 AND customer_id=$10 RETURNING id,label,recipient_name AS "recipientName",street,city,province,postal_code AS "postalCode",country,is_default AS "isDefault"`,[label,a.recipientName,a.street,a.city,a.province,a.postalCode,a.country,Boolean(req.body.isDefault),req.params.id,req.customer.sub]);if(!rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Address not found.'});}await client.query('COMMIT');res.json({address:rows[0]});}catch(e){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Could not update address.'});}finally{client.release();}});
app.delete("/api/addresses/:id",requireCustomer,async(req,res)=>{const r=await pool.query('DELETE FROM addresses WHERE id=$1 AND customer_id=$2 RETURNING id',[req.params.id,req.customer.sub]);if(!r.rows.length)return res.status(404).json({error:'Address not found.'});res.status(204).end();});

app.get("/api/orders",requireCustomer,async(req,res)=>{const{rows}=await pool.query(`SELECT id,order_number AS "orderNumber",status,subtotal,shipping_total AS "shippingTotal",total,currency,shipping_address AS "shippingAddress",created_at AS "createdAt",updated_at AS "updatedAt" FROM orders WHERE customer_id=$1 ORDER BY created_at DESC`,[req.customer.sub]);res.json({orders:rows});});
app.get("/api/orders/:id",requireCustomer,async(req,res)=>{const{rows}=await pool.query(`SELECT o.*,COALESCE(json_agg(json_build_object('productId',oi.product_id,'name',oi.product_name,'size',oi.size,'quantity',oi.quantity,'unitPrice',oi.unit_price,'lineTotal',oi.line_total) ORDER BY oi.id) FILTER(WHERE oi.id IS NOT NULL),'[]') AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 AND o.customer_id=$2 GROUP BY o.id`,[req.params.id,req.customer.sub]);if(!rows.length)return res.status(404).json({error:"Order not found."});res.json({order:rows[0]});});

async function initializePaystack(order, account){
  if(!process.env.PAYSTACK_SECRET_KEY) throw new Error("Paystack is not configured.");
  const reference=`DCPS-${order.orderNumber.replace(/[^A-Za-z0-9=._-]/g,"")}`;
  const response=await fetch("https://api.paystack.co/transaction/initialize",{
    method:"POST",
    headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      email:account.email,
      amount:String(Math.round(Number(order.total)*100)),
      currency:"ZAR",
      reference,
      callback_url:`${FRONTEND_ORIGIN}/account.html?payment=complete&reference=${encodeURIComponent(reference)}`,
      metadata:{order_id:order.id,order_number:order.order_number,customer_id:account.id}
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.status||!data.data?.authorization_url) throw new Error("Payment provider initialization failed.");
  return {reference,authorizationUrl:data.data.authorization_url,accessCode:data.data.access_code||null};
}

app.post("/api/payments/paystack/initialize",requireCustomer,checkoutLimiter,async(req,res)=>{
  const orderId=safeText(req.body.orderId,80);
  if(!orderId)return res.status(400).json({error:"Order is required."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    // Serialize payment initialization for this order. A double-click, browser
    // retry, or two tabs cannot create two Paystack transactions for one order.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[orderId]);
    const result=await client.query(`SELECT o.id,o.order_number,o.total,o.status,c.id AS customer_id,c.email,
      p.status AS payment_status,p.provider_reference,p.authorization_url,p.access_code
      FROM orders o JOIN customer_accounts c ON c.id=o.customer_id
      LEFT JOIN payments p ON p.order_id=o.id AND p.provider='paystack'
      WHERE o.id=$1 AND o.customer_id=$2 FOR UPDATE`,[orderId,req.customer.sub]);
    if(!result.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Order not found."});}
    const order=result.rows[0];
    if(order.status!=="pending_payment") { await client.query("ROLLBACK"); return res.status(409).json({error:"This order is not awaiting payment."}); }
    if(order.payment_status==='paid') { await client.query("ROLLBACK"); return res.status(409).json({error:"This order has already been paid."}); }
    if(order.authorization_url){
      await client.query("COMMIT");
      return res.json({reference:order.provider_reference,authorizationUrl:order.authorization_url,accessCode:order.access_code||null,reused:true});
    }
    const payment=await initializePaystack(order,{id:order.customer_id,email:order.email});
    await client.query(`INSERT INTO payments(order_id,provider,provider_reference,status,amount,currency,authorization_url,access_code)
      VALUES($1,'paystack',$2,'initiated',$3,'ZAR',$4,$5)
      ON CONFLICT(order_id,provider) DO UPDATE SET provider_reference=EXCLUDED.provider_reference,
      status='initiated',amount=EXCLUDED.amount,currency='ZAR',authorization_url=EXCLUDED.authorization_url,
      access_code=EXCLUDED.access_code,updated_at=NOW()`,[order.id,payment.reference,order.total,payment.authorizationUrl,payment.accessCode]);
    await client.query("COMMIT");
    res.json(payment);
  }catch(err){
    await client.query("ROLLBACK").catch(()=>{});
    console.error("PAYSTACK_INITIALIZE_FAILED",err);
    res.status(503).json({error:"Online payment is not available right now. Please try again later."});
  }finally{client.release();}
});
app.get("/api/payments/paystack/status",requireCustomer,async(req,res)=>{
  const reference=safeText(req.query.reference,160);
  if(!reference)return res.status(400).json({error:"Payment reference is required."});
  const {rows}=await pool.query(`SELECT p.provider_reference AS "reference",p.status AS "paymentStatus",o.id AS "orderId",o.order_number AS "orderNumber",o.status AS "orderStatus",o.total,o.currency
    FROM payments p JOIN orders o ON o.id=p.order_id
    WHERE p.provider='paystack' AND p.provider_reference=$1 AND o.customer_id=$2 LIMIT 1`,[reference,req.customer.sub]);
  if(!rows.length)return res.status(404).json({error:"Payment not found."});
  res.json({payment:rows[0]});
});
app.post("/api/payments/paystack/webhook",async(req,res)=>{try{const signature=req.get("x-paystack-signature")||"";if(!process.env.PAYSTACK_SECRET_KEY||!req.rawBody)return res.sendStatus(400);const expected=crypto.createHmac("sha512",process.env.PAYSTACK_SECRET_KEY).update(req.rawBody).digest("hex");if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return res.sendStatus(401);const event=req.body;if(event.event!=="charge.success")return res.sendStatus(200);const data=event.data||{};const reference=safeText(data.reference,100);const client=await pool.connect();try{await client.query("BEGIN");const paymentResult=await client.query(`SELECT p.id,p.order_id,p.amount,o.total,o.customer_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.provider='paystack' AND p.provider_reference=$1 FOR UPDATE`,[reference]);if(!paymentResult.rows.length){await client.query("COMMIT");return res.sendStatus(200);}const payment=paymentResult.rows[0];if(Number(data.amount)!==Math.round(Number(payment.amount)*100)||String(data.currency||"").toUpperCase()!=="ZAR"){await client.query("ROLLBACK");return res.sendStatus(400);}if((await client.query("SELECT status FROM payments WHERE id=$1 FOR UPDATE",[payment.id])).rows[0]?.status !== 'paid'){
        await client.query("UPDATE payments SET status='paid',paid_at=NOW(),provider_payload=$1,updated_at=NOW() WHERE id=$2",[JSON.stringify(data),payment.id]);
        await client.query("UPDATE orders SET status='paid',reservation_expires_at=NULL,updated_at=NOW() WHERE id=$1 AND status='pending_payment'",[payment.order_id]);
      }await client.query("COMMIT");await audit("system",null,"payment.paid",req,{orderId:payment.order_id,reference});}catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}finally{client.release();}return res.sendStatus(200);}catch(err){console.error("PAYSTACK_WEBHOOK_FAILED",err);return res.sendStatus(500);}});

app.get("/api/orders/:id/shipment",requireCustomer,async(req,res)=>{const{rows}=await pool.query(`SELECT s.carrier,s.tracking_number AS "trackingNumber",s.status,s.shipped_at AS "shippedAt",s.delivered_at AS "deliveredAt" FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.order_id=$1 AND o.customer_id=$2`,[req.params.id,req.customer.sub]);if(!rows.length)return res.status(404).json({error:"Shipment not found."});res.json({shipment:rows[0]});});
app.get("/api/admin/settings",requireAdmin,async(_req,res)=>{const{rows}=await pool.query("SELECT standard_shipping AS \"standardShipping\",express_shipping AS \"expressShipping\",free_shipping_threshold AS \"freeShippingThreshold\",country,store_name AS \"storeName\",tagline,currency,store_status AS \"storeStatus\" FROM store_settings WHERE id=1");res.json({settings:rows[0]||null});});
app.patch("/api/admin/settings",requireAdmin,async(req,res)=>{const standard=Number(req.body.standardShipping),express=Number(req.body.expressShipping),threshold=Number(req.body.freeShippingThreshold),country=safeText(req.body.country||"ZA",2).toUpperCase(),storeName=safeText(req.body.storeName||"DripCartel",120),tagline=safeText(req.body.tagline||"",255),currency=safeText(req.body.currency||"ZAR",3).toUpperCase(),status=safeText(req.body.storeStatus||"open",20);if(![standard,express,threshold].every(Number.isFinite)||[standard,express,threshold].some(v=>v<0)||!/^[A-Z]{2}$/.test(country)||!/^[A-Z]{3}$/.test(currency)||!['open','closed'].includes(status))return res.status(400).json({error:"Invalid store settings."});const{rows}=await pool.query(`UPDATE store_settings SET standard_shipping=$1,express_shipping=$2,free_shipping_threshold=$3,country=$4,store_name=$5,tagline=$6,currency=$7,store_status=$8,updated_at=NOW() WHERE id=1 RETURNING standard_shipping AS "standardShipping",express_shipping AS "expressShipping",free_shipping_threshold AS "freeShippingThreshold",country,store_name AS "storeName",tagline,currency,store_status AS "storeStatus"`,[standard,express,threshold,country,storeName,tagline,currency,status]);await audit('admin',req.admin.sub,'settings.updated',req,{settings:{standardShipping:standard,expressShipping:express,freeShippingThreshold:threshold}});res.json({settings:rows[0]});});
app.get("/api/admin/inventory",requireAdmin,async(_req,res)=>{const{rows}=await pool.query(`SELECT v.id,v.sku,v.size,v.colour,v.stock,v.price,p.id AS "productId",p.name,p.category,p.price AS product_price FROM product_variants v JOIN products p ON p.id=v.product_id ORDER BY p.name,v.size,v.colour`);res.json({variants:rows.map(v=>({...v,price:canonicalProductPrice(v.productId,v.name,v.category,v.price)}))});});
app.patch("/api/admin/variants/:id",requireAdmin,async(req,res)=>{const stock=Number(req.body.stock),price=req.body.price===null||req.body.price===undefined?null:Number(req.body.price);if(!Number.isInteger(stock)||stock<0||stock>100000)return res.status(400).json({error:'Invalid stock.'});if(price!==null&&(!Number.isFinite(price)||price<0))return res.status(400).json({error:'Invalid price.'});const client=await pool.connect();try{await client.query('BEGIN');const old=await client.query('SELECT id,product_id,stock FROM product_variants WHERE id=$1 FOR UPDATE',[req.params.id]);if(!old.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Variant not found.'});}const delta=stock-old.rows[0].stock;const productInfo=await client.query("SELECT id,name,category,price FROM products WHERE id=$1",[old.rows[0].product_id]);const catalogPrice=productInfo.rows[0]?canonicalProductPrice(productInfo.rows[0].id,productInfo.rows[0].name,productInfo.rows[0].category,productInfo.rows[0].price):price;const lockedPrice=productInfo.rows[0]&&Object.prototype.hasOwnProperty.call(LOCKED_PRODUCT_PRICES,productInfo.rows[0].id)?catalogPrice:(productInfo.rows[0]&&productInfo.rows[0].category==='Hoodies'&&/\b(zip|zipper)\b/i.test(`${productInfo.rows[0].id} ${productInfo.rows[0].name}`)?400:price);const{rows}=await client.query(`UPDATE product_variants SET stock=$1,price=COALESCE($2,price),updated_at=NOW() WHERE id=$3 RETURNING id,sku,size,colour,stock,price`,[stock,lockedPrice,req.params.id]);if(delta)await client.query(`INSERT INTO inventory_movements(product_id,variant_id,quantity,reason) VALUES($1,$2,$3,'admin_adjustment')`,[old.rows[0].product_id,req.params.id,delta]);await client.query(`UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=$1),updated_at=NOW() WHERE id=$1`,[old.rows[0].product_id]);await client.query('COMMIT');await audit('admin',req.admin.sub,'inventory.adjusted',req,{variantId:req.params.id,delta});res.json({variant:rows[0]});}catch(e){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Could not update inventory.'});}finally{client.release();}});
app.patch("/api/admin/orders/:id/shipment",requireAdmin,async(req,res)=>{const status=safeText(req.body.status||'pending',40);const allowed=['pending','packed','shipped','out_for_delivery','delivered'];if(!allowed.includes(status))return res.status(400).json({error:'Invalid shipment status.'});const tracking=safeText(req.body.trackingNumber,160)||null;const carrier=safeText(req.body.carrier,80)||null;const{rows}=await pool.query(`INSERT INTO shipments(order_id,carrier,tracking_number,status,shipped_at,delivered_at) VALUES($1,$2,$3,$4,CASE WHEN $4 IN ('shipped','out_for_delivery','delivered') THEN NOW() END,CASE WHEN $4='delivered' THEN NOW() END) ON CONFLICT(order_id) DO UPDATE SET carrier=EXCLUDED.carrier,tracking_number=EXCLUDED.tracking_number,status=EXCLUDED.status,shipped_at=COALESCE(shipments.shipped_at,EXCLUDED.shipped_at),delivered_at=EXCLUDED.delivered_at,updated_at=NOW() RETURNING id,order_id AS "orderId",carrier,tracking_number AS "trackingNumber",status,shipped_at AS "shippedAt",delivered_at AS "deliveredAt"`,[req.params.id,carrier,tracking,status]);await audit('admin',req.admin.sub,'shipment.updated',req,{orderId:req.params.id,status,trackingNumber:tracking});res.json({shipment:rows[0]});});
app.post("/api/admin/orders/:id/refund",requireAdmin,async(req,res)=>{const requested=Number(req.body.amount);const client=await pool.connect();try{await client.query('BEGIN');const q=await client.query(`SELECT o.id,o.status,o.total,p.id AS payment_id,p.provider_reference,p.amount FROM orders o JOIN payments p ON p.order_id=o.id AND p.provider='paystack' WHERE o.id=$1 FOR UPDATE`,[req.params.id]);if(!q.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Paid payment not found.'});}const o=q.rows[0];if(o.status!=='paid'&&o.status!=='processing'&&o.status!=='shipped'&&o.status!=='delivered'){await client.query('ROLLBACK');return res.status(409).json({error:'Only a paid order can be refunded.'});}const already=await client.query(`SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE payment_id=$1 AND status IN ('requested','processed')`,[o.payment_id]);const amount=Number.isFinite(requested)&&requested>0?requested:Number(o.amount);if(amount<=0||amount>Number(o.amount)-Number(already.rows[0].total))throw Object.assign(new Error('Refund amount exceeds the remaining refundable amount.'),{status:400});if(!process.env.PAYSTACK_SECRET_KEY)throw Object.assign(new Error('Payment provider is not configured.'),{status:503});
const providerResponse=await fetch('https://api.paystack.co/refund',{method:'POST',headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({transaction:o.provider_reference,amount:Math.round(amount*100)})});
const providerData=await providerResponse.json().catch(()=>({}));
if(!providerResponse.ok||!providerData.status){throw Object.assign(new Error(providerData.message||'Payment provider could not process the refund.'),{status:502});}
const{rows}=await client.query(`INSERT INTO refunds(payment_id,order_id,amount,status,provider_reference,provider_payload,reason,processed_at) VALUES($1,$2,$3,'processed',$4,$5,$6,NOW()) RETURNING id,amount,status,provider_reference AS "providerReference",created_at AS "createdAt"`,[o.payment_id,o.id,amount,providerData.data?.transaction_reference||o.provider_reference,JSON.stringify(providerData.data||providerData),safeText(req.body.reason,500)]);
if(amount>=Number(o.amount)){const lines=await client.query("SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=$1",[o.id]);for(const line of lines.rows){if(line.variant_id)await client.query("UPDATE product_variants SET stock=stock+$1,updated_at=NOW() WHERE id=$2",[line.quantity,line.variant_id]);await client.query("UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=$1),updated_at=NOW() WHERE id=$1",[line.product_id]);await client.query(`INSERT INTO inventory_movements(product_id,variant_id,quantity,reason,reference_id) VALUES($1,$2,$3,'order_refunded',$4)`,[line.product_id,line.variant_id,line.quantity,o.id]);}await client.query("UPDATE orders SET status='refunded',reservation_expires_at=NULL,updated_at=NOW() WHERE id=$1",[o.id]);}
await client.query('COMMIT');await audit('admin',req.admin.sub,'refund.processed',req,{orderId:o.id,refundId:rows[0].id,amount});res.status(201).json({refund:rows[0]});}catch(e){await client.query('ROLLBACK').catch(()=>{});res.status(e.status||500).json({error:e.status?e.message:'Could not create refund request.'});}finally{client.release();}});

app.get("/api/admin/orders",requireAdmin,async(_req,res)=>{const{rows}=await pool.query(`SELECT o.id,o.order_number AS "orderNumber",o.status,o.total,o.currency,o.created_at AS "createdAt",c.first_name AS "firstName",c.last_name AS "lastName",c.email,c.phone,COALESCE(p.status,'unpaid') AS "paymentStatus",p.provider_reference AS "paymentReference" FROM orders o JOIN customer_accounts c ON c.id=o.customer_id LEFT JOIN payments p ON p.order_id=o.id ORDER BY o.created_at DESC LIMIT 500`);res.json({orders:rows});});
app.get("/api/admin/metrics",requireAdmin,async(_req,res)=>{const{rows}=await pool.query(`SELECT COUNT(*)::int AS orders,COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END),0)::numeric AS revenue,COUNT(*) FILTER(WHERE status='pending_payment')::int AS pending_orders,(SELECT COUNT(*)::int FROM customer_accounts WHERE status='active') AS customers,(SELECT COALESCE(SUM(stock),0)::int FROM products) AS units_available FROM orders`);const statusRows=await pool.query(`SELECT status,COUNT(*)::int AS count FROM orders GROUP BY status`);res.json({metrics:{...rows[0],statuses:Object.fromEntries(statusRows.rows.map(r=>[r.status,r.count]))}});});
app.patch("/api/admin/orders/:id/status",requireAdmin,async(req,res)=>{const status=safeText(req.body.status,40);const allowed=["pending_payment","paid","processing","shipped","delivered","cancelled","refunded"];if(!allowed.includes(status))return res.status(400).json({error:"Invalid order status."});const client=await pool.connect();try{await client.query("BEGIN");const current=await client.query("SELECT id,status,total FROM orders WHERE id=$1 FOR UPDATE",[req.params.id]);if(!current.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Order not found."});}if(status==='refunded'&&current.rows[0].status!=='refunded'){const paid=await client.query("SELECT COALESCE(SUM(amount),0) AS total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.order_id=$1 AND r.status='processed'",[req.params.id]);if(Number(paid.rows[0].total)<Number(current.rows[0].total)){await client.query("ROLLBACK");return res.status(409).json({error:"Process the full payment refund before marking this order refunded."});}}if(["cancelled","refunded"].includes(status)&&!["cancelled","refunded"].includes(current.rows[0].status)){const lines=await client.query("SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=$1",[req.params.id]);for(const line of lines.rows){if(line.variant_id)await client.query("UPDATE product_variants SET stock=stock+$1,updated_at=NOW() WHERE id=$2",[line.quantity,line.variant_id]);await client.query("UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id=$1),updated_at=NOW() WHERE id=$1",[line.product_id]);await client.query(`INSERT INTO inventory_movements(product_id,variant_id,quantity,reason,reference_id) VALUES($1,$2,$3,'order_cancelled',$4)`,[line.product_id,line.variant_id,line.quantity,req.params.id]);}}const{rows}=await client.query("UPDATE orders SET status=$1,reservation_expires_at=NULL,updated_at=NOW() WHERE id=$2 RETURNING id,order_number AS \"orderNumber\",status,total",[status,req.params.id]);await client.query("COMMIT");await audit("admin",req.admin.sub,"order.status_changed",req,{orderId:req.params.id,status});res.json({order:rows[0]});}catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}finally{client.release();}});

const frontendRoot=path.resolve(__dirname,"../frontend");app.use(express.static(frontendRoot,{index:"index.html",maxAge:process.env.NODE_ENV==="production"?"1d":0}));app.use((req,res,next)=>{if(req.path.startsWith("/api/"))return next();res.sendFile(path.join(frontendRoot,"index.html"));});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"Unexpected server error."});});
app.listen(PORT,()=>console.log(`DripCartel server running on http://localhost:${PORT}`));
