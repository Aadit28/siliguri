const {
  adminClient,
  allowDurable,
  authenticate,
  makeRateLimiter,
  normalizePhone,
  readBody,
  recordDurable,
  requestIp,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');

const SOURCES = new Set(['help', 'assistant', 'service']);

// Unauthenticated endpoint that stores PII — pace it per IP on top of the
// per-phone dedupe below (per-instance; burst protection only).
const allowByIp = makeRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });

// The in-memory limiter above resets on every cold start and does not add up
// across serverless instances, so a slow flood from one source gets a fresh
// allowance per instance. These caps are durable (migration 12) and bound the
// day: a human asking for a call back needs one or two, not twenty.
const DAY_MS = 24 * 60 * 60 * 1000;
const IP_PER_DAY = 20;
const PHONE_PER_DAY = 5;

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const issue = String(body.issue || '').trim();
    const source = SOURCES.has(body.source) ? body.source : 'help';
    const serviceId = body.serviceId ? String(body.serviceId) : null;

    if (!name || !phone) return send(res, 400, { error: 'Add a name and phone number.' });
    if (phone.replace(/\D/g, '').length < 8) return send(res, 400, { error: 'Add a valid phone number.' });

    const ip = requestIp(req);
    if (!allowByIp(ip)) {
      return send(res, 429, { error: 'Too many requests. Please wait a few minutes.' });
    }

    // Bucket on the normalized number, not the typed one: "9800000001" and
    // "+91 98000 00001" are the same phone, and a per-day cap keyed on the raw
    // string would be bypassed by retyping the spacing.
    const phoneKey = normalizePhone(phone) || phone;
    const admin = adminClient();
    const [ipUnderCap, phoneUnderCap] = await Promise.all([
      allowDurable(admin, `callback:ip:${ip}`, { max: IP_PER_DAY, windowMs: DAY_MS }),
      allowDurable(admin, `callback:phone:${phoneKey}`, { max: PHONE_PER_DAY, windowMs: DAY_MS }),
    ]);
    if (!ipUnderCap || !phoneUnderCap) {
      return send(res, 429, {
        error: 'We already have your requests. Our team will call you back soon.',
      });
    }

    let userId = null;
    let cityId = null;
    const hasToken = Boolean(String(req.headers.authorization || req.headers.Authorization || '').trim());
    let supabase = adminClient();
    if (hasToken) {
      const auth = await authenticate(req);
      if (!auth.error) {
        userId = auth.user.id;
        cityId = auth.user.city_id || null;
        supabase = auth.supabase;
      }
    }

    // An unauthenticated request has no city of its own, and a row with no city
    // is visible to every city's admins. When the request came from a service
    // page, borrow that service's city so it reaches the right desk instead.
    if (!cityId && serviceId) {
      const { data: service } = await adminClient()
        .from('services')
        .select('city_id')
        .eq('id', serviceId)
        .maybeSingle();
      cityId = service?.city_id || null;
    }

    // Best-effort dedupe: one request per phone per 10 minutes
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await adminClient()
      .from('callback_requests')
      .select('id')
      .eq('phone', phone)
      .gte('created_at', cutoff)
      .limit(1);
    if (!recentError && recent && recent.length > 0) {
      return send(res, 429, {
        error: 'We already have your request. Our team will call you back soon.',
      });
    }

    const { error } = await supabase.from('callback_requests').insert({
      name,
      phone,
      issue,
      source,
      service_id: serviceId,
      user_id: userId,
      city_id: cityId,
      status: 'new',
    });

    if (error) throw error;

    // Only a row that actually reached the desk spends the budget, so a caller
    // whose request was rejected for a bad phone number is not penalised.
    await recordDurable(admin, [`callback:ip:${ip}`, `callback:phone:${phoneKey}`]);
    return send(res, 200, { ok: true });
  } catch (error) {
    return sendServerError(res, error, 'Could not save callback request. Please try again.');
  }
};
