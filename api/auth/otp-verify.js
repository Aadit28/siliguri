const crypto = require('crypto');
const {
  adminClient,
  createSession,
  localPhoneUserId,
  normalizePhone,
  passwordHash,
  publicUser,
  readBody,
  saveLocalPhoneAuth,
  send,
  validatePhone,
  withCors,
} = require('../_lib/auth');

const MAX_ATTEMPTS = 5;

function otpHash(phone, code) {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

async function findUserByPhone(supabase, phone) {
  const { data, error } = await supabase
    .from('user_accounts')
    .select('id,username,full_name,phone_number,role,city_id,created_at')
    .eq('phone_number', phone)
    .maybeSingle();
  if (error && String(error.message || '').toLowerCase().includes('phone_number')) {
    const userId = localPhoneUserId(phone);
    if (!userId) return null;
    const fallback = await supabase
      .from('user_accounts')
      .select('id,username,full_name,role,city_id,created_at')
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? { ...fallback.data, phone_number: phone } : null;
  }
  if (error) throw error;
  return data;
}

async function createUserForPhone(supabase, phone, fullName) {
  // Passwordless account: random password so username+password login stays
  // unusable until the user sets one.
  const salt = crypto.randomBytes(16).toString('base64');
  const randomPassword = crypto.randomBytes(24).toString('base64url');
  const insertRow = {
    username: phone,
    full_name: fullName || `Saathi user ${phone.slice(-4)}`,
    password_salt: salt,
    password_hash: passwordHash(randomPassword, salt),
    phone_number: phone,
  };
  let { data: user, error } = await supabase
    .from('user_accounts')
    .insert(insertRow)
    .select('id,username,full_name,phone_number,role,city_id,created_at')
    .single();
  if (error && String(error.message || '').toLowerCase().includes('phone_number')) {
    const fallbackRow = { ...insertRow };
    delete fallbackRow.phone_number;
    const fallback = await supabase
      .from('user_accounts')
      .insert(fallbackRow)
      .select('id,username,full_name,role,city_id,created_at')
      .single();
    if (fallback.error) throw fallback.error;
    user = { ...fallback.data, phone_number: phone };
    saveLocalPhoneAuth(phone, user.id);
    return user;
  }
  if (error) throw error;
  saveLocalPhoneAuth(phone, user.id);
  return user;
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const phone = normalizePhone(body.phone);
    const code = String(body.code || '').replace(/\D/g, '');
    const fullName = String(body.fullName || '').trim();
    const validationError = validatePhone(phone) || (code.length !== 6 ? 'Enter the 6-digit code.' : undefined);
    if (validationError) return send(res, 400, { error: validationError });

    const supabase = adminClient();
    const { data: otp, error: otpError } = await supabase
      .from('phone_otps')
      .select('id,code_hash,attempts,expires_at')
      .eq('phone', phone)
      .maybeSingle();
    if (otpError) throw otpError;

    if (!otp || new Date(otp.expires_at).getTime() <= Date.now()) {
      return send(res, 401, { error: 'Code expired. Ask for a new one.' });
    }

    // Count this attempt atomically BEFORE comparing, so parallel requests
    // cannot race past the cap (see supabase-migration-8-otp-atomic.sql).
    const { data: attempts, error: attemptError } = await supabase.rpc('increment_otp_attempts', {
      otp_id: otp.id,
    });
    if (attemptError) throw attemptError;
    if (attempts == null) {
      return send(res, 401, { error: 'Code expired. Ask for a new one.' });
    }
    if (attempts > MAX_ATTEMPTS) {
      await supabase.from('phone_otps').delete().eq('id', otp.id);
      return send(res, 429, { error: 'Too many wrong tries. Ask for a new code.' });
    }
    if (otpHash(phone, code) !== otp.code_hash) {
      return send(res, 401, { error: 'That code is not right. Check WhatsApp and try again.' });
    }

    let user = await findUserByPhone(supabase, phone);
    const isNewUser = !user;
    if (!user) user = await createUserForPhone(supabase, phone, fullName);

    const session = await createSession(supabase, user.id);
    // Consume the code only once the user and session exist, so a downstream
    // failure does not burn a still-valid OTP.
    await supabase.from('phone_otps').delete().eq('id', otp.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) }, isNewUser });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not verify the code.' });
  }
};
