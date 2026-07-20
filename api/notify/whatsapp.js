const { authenticate, normalizePhone, readBody, send, validatePhone, withCors } = require('../_lib/auth');
const { sendTemplate, sendText, whatsappConfigured } = require('../_lib/whatsapp');

const STAFF_ROLES = new Set(['city_helper', 'admin', 'super_admin']);

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });
    if (!whatsappConfigured()) {
      return send(res, 503, { error: 'WhatsApp is not configured on the server.' });
    }

    const body = await readBody(req);
    const text = String(body.text || '').trim();
    const templateName = String(body.template || '').trim();
    if (!text && !templateName) return send(res, 400, { error: 'Provide text or a template name.' });

    const isStaff = STAFF_ROLES.has(auth.user.role);
    let phone = normalizePhone(body.phone);

    if (!isStaff) {
      // Regular users may only message their own registered number.
      const { data: account, error } = await auth.supabase
        .from('user_accounts')
        .select('phone_number')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (error) throw error;
      const ownPhone = normalizePhone(account?.phone_number);
      if (!ownPhone) return send(res, 400, { error: 'No phone number on your account.' });
      if (phone && phone !== ownPhone) {
        return send(res, 403, { error: 'You can only send WhatsApp messages to your own number.' });
      }
      phone = ownPhone;
    }

    const validationError = validatePhone(phone);
    if (validationError) return send(res, 400, { error: validationError });

    const result = templateName
      ? await sendTemplate(phone, templateName, body.lang, Array.isArray(body.params) ? body.params : [])
      : await sendText(phone, text);
    return send(res, 200, { sent: true, id: result?.messages?.[0]?.id || null });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not send the WhatsApp message.' });
  }
};
