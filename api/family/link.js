const crypto = require('crypto');
const {
  authenticate,
  localPhoneUserId,
  normalizePhone,
  readBody,
  send,
  tokenHash,
  validatePhone,
  withCors,
} = require('../_lib/auth');
const { sendOtp, whatsappConfigured } = require('../_lib/whatsapp');

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function guardianLink(row) {
  const parent = row.parent || null;
  return {
    id: row.id,
    status: row.status,
    parentId: row.parent_id || null,
    parentName: parent ? parent.full_name || parent.username : null,
    parentPhone: row.parent_phone,
    relationship: row.relationship || null,
    createdAt: row.created_at,
    verifiedAt: row.verified_at || null,
  };
}

function parentLink(row) {
  const guardian = row.guardian || null;
  return {
    id: row.id,
    status: row.status,
    guardianId: row.guardian_id || null,
    guardianName: guardian ? guardian.full_name || guardian.username : null,
    createdAt: row.created_at,
    verifiedAt: row.verified_at || null,
  };
}

async function findParentByPhone(supabase, phone) {
  const { data, error } = await supabase
    .from('user_accounts')
    .select('id,full_name,username')
    .eq('phone_number', phone)
    .maybeSingle();
  // Setups without a phone_number column fall back to the local phone->id map,
  // mirroring findUserByPhone in api/auth/otp-verify.js.
  if (error && String(error.message || '').toLowerCase().includes('phone_number')) {
    const userId = localPhoneUserId(phone);
    if (!userId) return null;
    const fallback = await supabase
      .from('user_accounts')
      .select('id,full_name,username')
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data || null;
  }
  if (error) throw error;
  return data || null;
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const action = ['request', 'verify', 'list', 'revoke'].includes(body.action) ? body.action : 'list';

    if (action === 'request') {
      const phone = normalizePhone(body.parentPhone);
      const validationError = validatePhone(phone);
      if (validationError) return send(res, 400, { error: validationError });

      const devEcho = !whatsappConfigured() && process.env.OTP_DEV_ECHO === '1';
      if (!whatsappConfigured() && !devEcho) {
        return send(res, 503, { error: 'WhatsApp is not set up yet. Try again later.' });
      }

      const parent = await findParentByPhone(auth.supabase, phone);
      if (!parent) {
        return send(res, 404, { error: 'No Saathi account uses that number yet. Ask your parent to sign in first.' });
      }
      if (parent.id === auth.user.id) {
        return send(res, 400, { error: 'You cannot link your own account.' });
      }

      const { data: existing, error: existingError } = await auth.supabase
        .from('family_links')
        .select('status')
        .eq('guardian_id', auth.user.id)
        .eq('parent_phone', phone)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing && existing.status === 'active') {
        return send(res, 400, { error: 'You are already linked to this parent.' });
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const { error } = await auth.supabase.from('family_links').upsert(
        {
          guardian_id: auth.user.id,
          parent_phone: phone,
          relationship: body.relationship ? String(body.relationship).trim() : null,
          status: 'pending',
          otp_hash: tokenHash(code),
          otp_expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
          attempts: 0,
        },
        { onConflict: 'guardian_id,parent_phone' },
      );
      if (error) throw error;

      if (devEcho) return send(res, 200, { ok: true, devCode: code });
      await sendOtp(phone, code);
      return send(res, 200, { ok: true });
    }

    if (action === 'verify') {
      const phone = normalizePhone(body.parentPhone);
      const code = String(body.code || '').replace(/\D/g, '');
      const validationError = validatePhone(phone) || (code.length !== 6 ? 'Enter the 6-digit code.' : undefined);
      if (validationError) return send(res, 400, { error: validationError });

      const { data: linkRow, error: linkError } = await auth.supabase
        .from('family_links')
        .select('id,status,otp_hash,otp_expires_at,attempts')
        .eq('guardian_id', auth.user.id)
        .eq('parent_phone', phone)
        .maybeSingle();
      if (linkError) throw linkError;
      // A revoked link keeps no live OTP (revoke clears it), but guard anyway so
      // a stale code can never re-activate a link the parent removed.
      if (!linkRow || linkRow.status === 'revoked' || !linkRow.otp_hash || !linkRow.otp_expires_at) {
        return send(res, 404, { error: 'Ask for a code first.' });
      }
      if (new Date(linkRow.otp_expires_at).getTime() <= Date.now()) {
        return send(res, 401, { error: 'Code expired. Ask for a new one.' });
      }
      // Cap guesses like api/auth/otp-verify.js: once the limit is hit, burn the
      // code so brute-forcing the 6-digit space cannot grant access.
      if ((linkRow.attempts || 0) >= MAX_ATTEMPTS) {
        await auth.supabase
          .from('family_links')
          .update({ otp_hash: null, otp_expires_at: null })
          .eq('id', linkRow.id);
        return send(res, 429, { error: 'Too many wrong tries. Ask for a new code.' });
      }
      if (tokenHash(code) !== linkRow.otp_hash) {
        const nextAttempts = (linkRow.attempts || 0) + 1;
        const patch = { attempts: nextAttempts };
        if (nextAttempts >= MAX_ATTEMPTS) {
          patch.otp_hash = null;
          patch.otp_expires_at = null;
        }
        await auth.supabase.from('family_links').update(patch).eq('id', linkRow.id);
        if (nextAttempts >= MAX_ATTEMPTS) {
          return send(res, 429, { error: 'Too many wrong tries. Ask for a new code.' });
        }
        return send(res, 401, { error: 'That code is not right. Check your parent’s WhatsApp and try again.' });
      }

      const parent = await findParentByPhone(auth.supabase, phone);
      if (!parent) {
        return send(res, 404, { error: 'That account is no longer available.' });
      }

      // Record consent before activating: if the receipt insert fails we do not
      // hand out active access without the receipt on file. A duplicate receipt
      // (guardian retried after a mid-flight error) is not an error here.
      const { error: consentError } = await auth.supabase.from('consent_receipts').insert({
        user_id: parent.id,
        consent_type: 'guardian_link',
        version: '1',
      });
      if (consentError && !String(consentError.message || '').toLowerCase().includes('duplicate')) {
        throw consentError;
      }

      const { data: updated, error: updateError } = await auth.supabase
        .from('family_links')
        .update({
          parent_id: parent.id,
          status: 'active',
          otp_hash: null,
          otp_expires_at: null,
          attempts: 0,
          verified_at: new Date().toISOString(),
        })
        .eq('id', linkRow.id)
        .select('id,status,parent_id,parent_phone,relationship,created_at,verified_at,parent:user_accounts!family_links_parent_id_fkey(full_name,username)')
        .single();
      if (updateError) throw updateError;

      return send(res, 200, { ok: true, link: guardianLink(updated) });
    }

    if (action === 'revoke') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Link id is required.' });
      // Clear any pending OTP too, so a revoked-while-pending link cannot be
      // re-activated with a code that was already in flight.
      const { data: revoked, error } = await auth.supabase
        .from('family_links')
        .update({ status: 'revoked', otp_hash: null, otp_expires_at: null })
        .eq('id', id)
        .or(`guardian_id.eq.${auth.user.id},parent_id.eq.${auth.user.id}`)
        .select('id');
      if (error) throw error;
      if (!revoked || revoked.length === 0) {
        return send(res, 404, { error: 'Link not found.' });
      }
      return send(res, 200, { ok: true });
    }

    // list
    const { data: guardianRows, error: guardianError } = await auth.supabase
      .from('family_links')
      .select('id,status,parent_id,parent_phone,relationship,created_at,verified_at,parent:user_accounts!family_links_parent_id_fkey(full_name,username)')
      .eq('guardian_id', auth.user.id)
      .order('created_at', { ascending: false });
    if (guardianError) throw guardianError;

    const { data: parentRows, error: parentError } = await auth.supabase
      .from('family_links')
      .select('id,status,guardian_id,created_at,verified_at,guardian:user_accounts!family_links_guardian_id_fkey(full_name,username)')
      .eq('parent_id', auth.user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (parentError) throw parentError;

    return send(res, 200, {
      asGuardian: (guardianRows || []).map(guardianLink),
      asParent: (parentRows || []).map(parentLink),
    });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not update family links.' });
  }
};
