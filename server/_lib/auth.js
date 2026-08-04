const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const TOKEN_TTL_DAYS = 30;
const PASSWORD_ITERATIONS = 310000;
const LOCAL_PHONE_AUTH_PATH = path.resolve(__dirname, '..', '..', '.codex', 'local-phone-auth.json');

function adminClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server auth is not configured. Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
  });
}

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function send(res, status, body) {
  withCors(res);
  res.status(status).json(body);
}

const MAX_BODY_BYTES = 64 * 1024;

function tooLarge() {
  const err = new Error('Request too large.');
  err.status = 413;
  err.publicError = 'Request too large.';
  return err;
}

// A client mistake, not a server fault. Carries the status and the message the
// caller is allowed to see; sendServerError passes both straight through.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.publicError = message;
  return err;
}

// maxBytes is overridable because /api/assistant/plan legitimately carries
// base64 photo attachments (a prescription photo is megabytes, not kilobytes);
// every other route stays on the small default.
async function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  // On Vercel req.body is a lazy getter that parses on first access, so an
  // invalid JSON body throws HERE rather than at our own JSON.parse below —
  // which is why malformed input still surfaced as a 500 in production after
  // the parser was hardened. Locally req.body is undefined and we read the
  // stream ourselves, so this branch is production-only.
  let provided;
  try {
    provided = req.body;
  } catch {
    throw badRequest('Send valid JSON.');
  }
  if (Buffer.isBuffer(provided)) return parseJson(provided.toString('utf8'));
  if (provided && typeof provided === 'object') return provided;
  if (typeof provided === 'string') {
    if (Buffer.byteLength(provided, 'utf8') > maxBytes) throw tooLarge();
    return parseJson(provided);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw tooLarge();
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return parseJson(raw);
}

// Unparseable JSON is the caller's error. Left to JSON.parse it throws a bare
// SyntaxError, which every handler's catch turns into a 500 — so a typo in a
// curl command looked like the server falling over.
function parseJson(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // A bare string, number or null body is not a request object; treating it
    // as one makes every field read undefined and fail somewhere further in.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw badRequest('Send a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (error && error.status === 400) throw error;
    throw badRequest('Send valid JSON.');
  }
}

// Routes dispatch on an {action} discriminator. An unrecognised action used to
// fall through to 'list', so a client typo ("create" instead of "add") returned
// 200 and a body that looked like success while silently doing nothing — the
// worst possible outcome for a guardian who thinks they just set a medicine
// reminder. Absent action still defaults, since older callers omit it.
function pickAction(value, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const action = String(value);
  if (!allowed.includes(action)) {
    throw badRequest(`Unknown action "${action}". Expected one of: ${allowed.join(', ')}.`);
  }
  return action;
}

// Generic 500 that never leaks driver/env internals to the client. Errors that
// carry their own 4xx status and a publicError string are client mistakes and
// pass straight through: only genuine server faults become a 500, so a 500 in
// the logs stays a signal worth chasing.
// Postgres codes for "the value you sent is not a valid input for this type":
// invalid uuid, invalid date/time, invalid number. These are the caller's typo,
// not a server fault, so they must not burn a 500 or an on-call page.
const CLIENT_INPUT_PG_CODES = new Set(['22P02', '22007', '22008', '22003']);

function sendServerError(res, error, publicMessage) {
  if (error && CLIENT_INPUT_PG_CODES.has(error.code)) {
    return send(res, 400, { error: 'One of the values sent is not in a valid format.' });
  }
  const status = error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  if (status === 500) console.error(publicMessage, error);
  return send(res, status, { error: (status !== 500 && error.publicError) || publicMessage });
}

// Constant-time comparison for password/OTP hash strings.
function hashesMatch(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Sliding-window in-memory limiter. Serverless instances reset it on cold
// start, so this is burst protection, not a durable quota (roadmap: DB-backed).
function makeRateLimiter({ max, windowMs }) {
  const hits = new Map();

  function prune(now) {
    if (hits.size <= 2000) return;
    for (const [k, timestamps] of hits) {
      if (!timestamps.some((ts) => now - ts < windowMs)) hits.delete(k);
    }
  }

  function live(key, now) {
    return (hits.get(key) || []).filter((ts) => now - ts < windowMs);
  }

  function allow(key) {
    const now = Date.now();
    const list = live(key, now);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    prune(now);
    return true;
  }

  // check/record split, for the callers that must only count the attempts worth
  // counting. allow() charges every call, which is right when the call itself is
  // the expensive thing (an SMS, a WhatsApp message) and wrong when it is not:
  // a shared mobile IP would otherwise spend its budget on people signing in
  // successfully. Indian carriers put many subscribers behind one address, so
  // "20 requests from this IP" is a normal morning, not an attack.
  allow.check = function check(key) {
    return live(key, Date.now()).length < max;
  };
  allow.record = function record(key) {
    const now = Date.now();
    const list = live(key, now);
    list.push(now);
    hits.set(key, list);
    prune(now);
  };

  return allow;
}

// Durable limiter backed by rate_events (migration 12): counts survive cold
// starts and hold across instances, which the in-memory limiter cannot do.
// Callers check with allowDurable and record with recordDurable, so only the
// events worth counting (e.g. FAILED sign-ins) spend the budget.
//
// Fails OPEN with a log: the limiter reads the same database the guarded
// operation writes, so when the database is down the operation fails anyway,
// and a broken limiter must not lock everyone out on a blip.
async function allowDurable(client, bucket, { max, windowMs }) {
  try {
    const since = new Date(Date.now() - windowMs).toISOString();
    const { count, error } = await client
      .from('rate_events')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket)
      .gte('created_at', since);
    if (error) throw error;
    return (count || 0) < max;
  } catch (error) {
    console.warn('Durable rate check failed (open):', error?.message || error);
    return true;
  }
}

async function recordDurable(client, buckets) {
  try {
    const rows = (Array.isArray(buckets) ? buckets : [buckets]).map((bucket) => ({ bucket }));
    if (!rows.length) return;
    const { error } = await client.from('rate_events').insert(rows);
    if (error) throw error;
  } catch (error) {
    console.warn('Durable rate record failed:', error?.message || error);
  }
}

// Anything a client can set is not an identity. x-forwarded-for is
// client-writable: taking its FIRST entry lets an attacker mint a fresh
// rate-limit bucket per request. Prefer the platform's own header, then the
// LAST forwarded entry (appended by the proxy closest to us, so the earlier
// spoofed entries cannot displace it), and fall back to the socket.
function requestIp(req) {
  const platform =
    req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || '';
  const trusted = String(platform).split(',').pop()?.trim();
  if (trusted) return trusted;
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[chain.length - 1] || req.socket?.remoteAddress || 'unknown';
}

function normalizeUsername(username) {
  return String(username || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : raw;
}

function validateUsername(username) {
  if (!username) return 'Enter your username.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 80) return 'Username is too long.';
  return undefined;
}

function validatePhone(phone) {
  if (!phone) return 'Enter your phone number.';
  if (!/^\+\d{8,15}$/.test(phone)) return 'Enter a valid phone number.';
  return undefined;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    return 'Use a password with at least 6 characters.';
  }
  return undefined;
}

function passwordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('base64');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readLocalPhoneAuth() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_PHONE_AUTH_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function localPhoneUserId(phone) {
  const map = readLocalPhoneAuth();
  return typeof map[phone] === 'string' ? map[phone] : null;
}

function saveLocalPhoneAuth(phone, userId) {
  // Dev-only fallback map. Vercel's filesystem is read-only, and this must
  // never fail a request after the account has been created.
  if (process.env.VERCEL) return;
  try {
    const map = readLocalPhoneAuth();
    fs.mkdirSync(path.dirname(LOCAL_PHONE_AUTH_PATH), { recursive: true });
    fs.writeFileSync(
      LOCAL_PHONE_AUTH_PATH,
      `${JSON.stringify({ ...map, [phone]: userId }, null, 2)}\n`,
    );
  } catch {
    // Best effort only.
  }
}

function publicUser(row) {
  return {
    id: row.id,
    user_metadata: {
      username: row.username,
      full_name: row.full_name || row.username,
      phone_number: row.phone_number || null,
      role: row.role || 'user',
      city_id: row.city_id || null,
    },
  };
}

async function createSession(supabase, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('auth_tokens').insert({
    user_id: userId,
    token_hash: tokenHash(token),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { access_token: token, expires_at: expiresAt };
}

async function authenticate(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Sign in again.' };

  const supabase = adminClient();
  const { data, error } = await supabase
    .from('auth_tokens')
    .select('id,user_id,expires_at,revoked_at,user_accounts(id,username,full_name,created_at,role,city_id)')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();

  if (error) throw error;
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: 'Sign in again.' };
  }
  return { supabase, token, tokenRow: data, user: data.user_accounts };
}

function requireAdmin(auth) {
  if (!auth.user || (auth.user.role !== 'admin' && auth.user.role !== 'super_admin')) {
    return { error: 'Admin access required.' };
  }
  return undefined;
}

const CITY_STAFF_ROLES = new Set(['city_helper', 'admin', 'super_admin']);

function requireCityStaff(auth) {
  if (!auth.user || !CITY_STAFF_ROLES.has(auth.user.role)) {
    return { error: 'City helper access required.' };
  }
  return undefined;
}

// The parent themselves, or a guardian with an active link to that parent, may
// touch the parent's reminders / care team / favorites. Returns undefined when
// allowed, an { error } object otherwise (throws only on a DB failure).
async function requireFamilyLink(auth, parentId) {
  if (!auth.user || !parentId) return { error: 'Not allowed.' };
  if (auth.user.id === parentId) return undefined;
  const { data, error } = await auth.supabase
    .from('family_links')
    .select('id')
    .eq('guardian_id', auth.user.id)
    .eq('parent_id', parentId)
    .eq('status', 'active')
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return { error: 'Not allowed.' };
  return undefined;
}

module.exports = {
  adminClient,
  allowDurable,
  authenticate,
  createSession,
  hashesMatch,
  localPhoneUserId,
  makeRateLimiter,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  badRequest,
  pickAction,
  readBody,
  recordDurable,
  requestIp,
  requireAdmin,
  requireCityStaff,
  requireFamilyLink,
  saveLocalPhoneAuth,
  send,
  sendServerError,
  tokenHash,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
};
