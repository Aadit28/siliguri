const crypto = require('crypto');
const {
  adminClient,
  normalizePhone,
  readBody,
  send,
  validatePhone,
  withCors,
} = require('../_lib/auth');
const { sendOtp, whatsappConfigured } = require('../_lib/whatsapp');

const OTP_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const DAILY_SEND_CAP = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function otpHash(phone, code) {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const phone = normalizePhone(body.phone);
    const validationError = validatePhone(phone);
    if (validationError) return send(res, 400, { error: validationError });

    // Never echo codes in production (Vercel), regardless of env misconfig.
    const isProd = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
    const devEcho = !isProd && !whatsappConfigured() && process.env.OTP_DEV_ECHO === '1';
    if (!whatsappConfigured() && !devEcho) {
      return send(res, 503, { error: 'WhatsApp sign-in is not set up yet. Use username and password.' });
    }

    const supabase = adminClient();
    const { data: existing, error: readError } = await supabase
      .from('phone_otps')
      .select('created_at,send_count,day_started_at')
      .eq('phone', phone)
      .maybeSingle();
    if (readError) throw readError;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    if (existing && now - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      return send(res, 429, { error: 'Code already sent. Wait a minute before asking again.' });
    }
    const sameDay = existing && now - new Date(existing.day_started_at).getTime() < DAY_MS;
    if (sameDay && (existing.send_count || 0) >= DAILY_SEND_CAP) {
      return send(res, 429, { error: 'Too many codes today. Try again tomorrow.' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const row = {
      phone,
      code_hash: otpHash(phone, code),
      attempts: 0,
      expires_at: new Date(now + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
      created_at: nowIso,
      send_count: sameDay ? (existing.send_count || 0) + 1 : 1,
      day_started_at: sameDay ? existing.day_started_at : nowIso,
    };
    if (existing) {
      // Conditional update keyed on the created_at we read: if a parallel
      // request rewrote the row first, this matches zero rows and we bail.
      const { data: updated, error } = await supabase
        .from('phone_otps')
        .update(row)
        .eq('phone', phone)
        .eq('created_at', existing.created_at)
        .select('phone');
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return send(res, 429, { error: 'Code already sent. Wait a minute before asking again.' });
      }
    } else {
      // Plain insert: a concurrent first request hits the unique(phone)
      // constraint instead of silently double-sending.
      const { error } = await supabase.from('phone_otps').insert(row);
      if (error) {
        if (String(error.message || '').toLowerCase().includes('duplicate')) {
          return send(res, 429, { error: 'Code already sent. Wait a minute before asking again.' });
        }
        throw error;
      }
    }

    if (devEcho) {
      return send(res, 200, { sent: true, devCode: code });
    }
    await sendOtp(phone, code);
    return send(res, 200, { sent: true });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not send the code.' });
  }
};
