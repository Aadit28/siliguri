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

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
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
  const map = readLocalPhoneAuth();
  fs.mkdirSync(path.dirname(LOCAL_PHONE_AUTH_PATH), { recursive: true });
  fs.writeFileSync(
    LOCAL_PHONE_AUTH_PATH,
    `${JSON.stringify({ ...map, [phone]: userId }, null, 2)}\n`,
  );
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

module.exports = {
  adminClient,
  authenticate,
  createSession,
  localPhoneUserId,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  requireAdmin,
  requireCityStaff,
  saveLocalPhoneAuth,
  send,
  tokenHash,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
};
