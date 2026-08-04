const crypto = require('crypto');
const {
  authenticate,
  makeRateLimiter,
  pickAction,
  readBody,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');
const { sendPushToUsers } = require('../_lib/push');

// Account share codes: the senior reads a code off their profile screen and
// says it to a family member, who types it in and becomes an active guardian.
// The WhatsApp OTP flow in link.js is untouched — this is a second door, meant
// for the very common case where the family member is on the phone already.
//
// A code is a low-entropy secret said out loud, so the guessing budget is the
// real defence: see allowJoin below.

// No 0/O, 1/I/L: these are read aloud and written on paper by people with
// reading glasses, and "did you say I or one" costs a support call.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
// Collisions are vanishingly unlikely (31^6 ≈ 887M) but not impossible, and a
// unique-violation must retry rather than surface as a failed rotate.
const MINT_ATTEMPTS = 5;

const RELATIONSHIPS = ['son', 'daughter', 'spouse', 'sibling', 'friend', 'caregiver', 'other'];

// A shared 6-character secret is guessable if guessing is cheap, so joining is
// the throttled action, not code creation. Every attempt is charged, including
// the ones that find nothing — a limiter that only counted successes would be
// no limiter at all. In-memory: burst protection, reset by cold starts, same
// caveat as every other limiter here (roadmap: DB-backed).
const allowJoin = makeRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
// Rotating is cheap for us and expensive for the senior's family (every old
// code stops working), so the cap is about accident, not attack.
const allowRotate = makeRateLimiter({ max: 5, windowMs: 24 * 60 * 60 * 1000 });

function mintCode() {
  // randomInt, not randomBytes % length: 256 does not divide 31, so modulo
  // would make the first few letters of the alphabet measurably likelier.
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// Accepts what a person types: lower case, the XXX-XXX grouping the profile
// screen shows, stray spaces from a WhatsApp paste.
function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isUniqueViolation(error) {
  return Boolean(error) && (error.code === '23505' || /duplicate key/i.test(String(error.message || '')));
}

// The migration is applied by hand, later, so production runs this code against
// a table with no share_code column for a while. That is a "not ready yet", not
// a server fault, and it must never reach the user as a 500.
function isMissingShareCodeColumn(error) {
  if (!error || isUniqueViolation(error)) return false;
  if (error.code === '42703') return true;
  return String(error.message || '').toLowerCase().includes('share_code');
}

function notReady(res) {
  return send(res, 503, {
    error: 'Account codes are not switched on yet. Please try again in a little while.',
  });
}

function grouped(code) {
  return code.length === CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

// Writes a fresh code onto the account, retrying past a collision with somebody
// else's code. Returns null when every attempt collided — the caller answers
// 503 rather than 500, because nothing is broken and a retry will work.
async function mintFor(supabase, userId) {
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const code = mintCode();
    const { error } = await supabase
      .from('user_accounts')
      .update({ share_code: code })
      .eq('id', userId);
    if (!error) return code;
    if (isUniqueViolation(error)) continue;
    throw error;
  }
  return null;
}

// phone_number predates nothing and is normally present, but findParentByPhone
// in link.js already tolerates setups without the column, so this select does
// too rather than 500 on a database the OTP path still works against.
async function findByShareCode(supabase, code) {
  const withPhone = await supabase
    .from('user_accounts')
    .select('id,full_name,username,phone_number')
    .eq('share_code', code)
    .maybeSingle();
  if (!withPhone.error) return withPhone.data || null;
  if (isMissingShareCodeColumn(withPhone.error)) throw withPhone.error;
  if (!String(withPhone.error.message || '').toLowerCase().includes('phone_number')) {
    throw withPhone.error;
  }
  const fallback = await supabase
    .from('user_accounts')
    .select('id,full_name,username')
    .eq('share_code', code)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data || null;
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const action = pickAction(body.action, ['get', 'rotate', 'join'], 'get');

    if (action === 'get' || action === 'rotate') {
      if (action === 'rotate' && !allowRotate(auth.user.id)) {
        return send(res, 429, { error: 'You have changed your code a few times today. Try again tomorrow.' });
      }

      if (action === 'get') {
        const { data, error } = await auth.supabase
          .from('user_accounts')
          .select('share_code')
          .eq('id', auth.user.id)
          .maybeSingle();
        if (error) {
          if (isMissingShareCodeColumn(error)) return notReady(res);
          throw error;
        }
        if (data && data.share_code) {
          return send(res, 200, { code: data.share_code, grouped: grouped(data.share_code) });
        }
      }

      let minted;
      try {
        minted = await mintFor(auth.supabase, auth.user.id);
      } catch (error) {
        if (isMissingShareCodeColumn(error)) return notReady(res);
        throw error;
      }
      if (!minted) return notReady(res);
      return send(res, 200, { code: minted, grouped: grouped(minted) });
    }

    // join
    const code = normalizeCode(body.code);
    const relationship = String(body.relationship || '').trim().toLowerCase();
    if (code.length !== CODE_LENGTH) {
      return send(res, 400, { error: 'Enter the 6-character code from their profile.' });
    }
    if (!RELATIONSHIPS.includes(relationship)) {
      return send(res, 400, { error: 'Choose how you are related to them.' });
    }
    // Charged before the lookup, so a wrong guess costs the same as a right
    // one. Otherwise the budget would only ever be spent by honest users.
    if (!allowJoin(auth.user.id)) {
      return send(res, 429, { error: 'Too many tries. Wait a while, then try the code again.' });
    }

    let senior;
    try {
      senior = await findByShareCode(auth.supabase, code);
    } catch (error) {
      if (isMissingShareCodeColumn(error)) return notReady(res);
      throw error;
    }
    // Unlike a phone number, a code is only known to somebody it was told to,
    // so a real "no match" answer is not an oracle worth hiding — and without
    // it the screen could not tell a typo from a server problem. It still says
    // nothing beyond "not a code", ever.
    if (!senior) {
      return send(res, 404, { error: 'That code did not match. Check it and try again.' });
    }
    if (senior.id === auth.user.id) {
      return send(res, 400, { error: 'That is your own code. Share it with a family member instead.' });
    }

    // family_links.parent_phone is NOT NULL and carries the (guardian, parent)
    // uniqueness, so a senior whose phone we cannot read still needs a stable
    // value. An id: marker is deterministic per senior — a re-join after a
    // revoke lands on the same row — and can never collide with a real +number.
    const parentPhone = senior.phone_number || `id:${senior.id}`;

    // Read the pair's rows and match in JS rather than filtering on both keys:
    // a link made by phone and a link made by code must resolve to the same
    // row, and only one of the two columns is populated in each case.
    const { data: mine, error: mineError } = await auth.supabase
      .from('family_links')
      .select('id,status,parent_id,parent_phone')
      .eq('guardian_id', auth.user.id);
    if (mineError) throw mineError;
    const existing = (mine || []).find(
      (row) => row.parent_id === senior.id || row.parent_phone === parentPhone,
    );
    if (existing && existing.status === 'active') {
      return send(res, 400, { error: 'You already help with this account.' });
    }

    // Consent on file before access is granted, exactly as the verify action
    // does it. A duplicate receipt means the person retried after a mid-flight
    // error, which is not a failure.
    const { error: consentError } = await auth.supabase.from('consent_receipts').insert({
      user_id: senior.id,
      consent_type: 'guardian_link',
      version: '1',
    });
    if (consentError && !String(consentError.message || '').toLowerCase().includes('duplicate')) {
      throw consentError;
    }

    const patch = {
      parent_id: senior.id,
      parent_phone: parentPhone,
      relationship,
      status: 'active',
      otp_hash: null,
      otp_expires_at: null,
      attempts: 0,
      verified_at: new Date().toISOString(),
    };

    // A pending or revoked row is reactivated: the senior read the code out
    // again, which is a fresh act of consent, not a leftover from the old one.
    const written = existing
      ? await auth.supabase.from('family_links').update(patch).eq('id', existing.id).select('id').single()
      : await auth.supabase
          .from('family_links')
          .insert({ guardian_id: auth.user.id, ...patch })
          .select('id')
          .single();
    if (written.error) throw written.error;

    const guardianName = auth.user.full_name || auth.user.username || 'A family member';
    const seniorName = senior.full_name || senior.username || null;
    // Awaited, not fired and forgotten: Vercel freezes the function the moment
    // the response ends. sendPushToUsers never throws, so this cannot fail the
    // join — and the senior must learn that somebody used their code.
    await sendPushToUsers(auth.supabase, [senior.id], {
      title: 'A family member joined your account',
      body: `${guardianName} can now see your reminders and help you.`,
      url: '/profile',
    });

    return send(res, 200, {
      ok: true,
      link: {
        id: written.data.id,
        status: 'active',
        parentId: senior.id,
        parentName: seniorName,
        relationship,
      },
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not use that account code.');
  }
};
