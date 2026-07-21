const { adminClient, authenticate, readBody, send, withCors } = require('../_lib/auth');

const CATEGORY_KEYWORDS = {
  doctor: ['doctor', 'appointment', 'opd', 'physician', 'cardio', 'heart', 'ortho', 'bone', 'medicine', 'specialist', 'clinic'],
  hospital: ['hospital', 'emergency', 'ambulance', 'admit', 'chest pain', 'stroke', 'accident', 'icu'],
  medical_shop: [
    'medical shop',
    'medicine shop',
    'medicine',
    'medicines',
    'pharmacy',
    'prescription',
    'tablet',
    'delivery',
    'drug',
    'wheelchair',
    'wheel chair',
    'medical equipment',
    'oxygen',
  ],
  travel_agent: ['travel', 'ticket', 'train', 'flight', 'bus', 'taxi', 'ride', 'airport', 'station'],
  elder_home: ['elder', 'old age', 'care home', 'attendant', 'nursing', 'parent', 'senior'],
  home_service: [
    'home service',
    'handyman',
    'plumber',
    'plumbing',
    'tap',
    'leak',
    'electrician',
    'electrical',
    'wiring',
    'fan',
    'appliance',
    'ac repair',
    'carpenter',
    'painter',
    'repair',
    'technician',
  ],
  daily_service: ['water', 'electricity', 'post office', 'gas', 'lpg', 'municipal', 'garbage', 'civic'],
};

const URGENT_WORDS = [
  'emergency',
  'urgent',
  'chest pain',
  'breathing',
  'stroke',
  'unconscious',
  'accident',
  'bleeding',
  'severe',
  'ambulance',
];

const ROUTE_TIME_WORDS = [
  'how long',
  'eta',
  'traffic',
  'take',
  'drive',
  'ride',
  'car',
  'taxi',
  'minutes',
  'time',
];

const CALENDAR_SCREEN_WORDS = ['calendar', 'appointment', 'schedule', 'reminder', 'कैलेंडर', 'अपॉइंटमेंट', 'रिमाइंडर'];

const CONNECTOR_SCREEN_WORDS = [
  'what can you connect',
  'which apps work with',
  'what connects',
  'connector',
  'connections',
  'integration',
  'jud sakta',
  'jud sakti',
  'jod sakta',
  'जुड़ सकता',
  'जुड़ सकते',
  'जोड़ सकते',
];

const COPY = {
  en: {
    urgentSummary: 'This may be urgent. Please call emergency help or the nearest hospital now.',
    noService: 'I can help plan this, but I could not find a matching verified service in Saathi yet.',
    foundService: (name) => `I found ${name} as the best first contact.`,
    readyMedical: (name, when) => `I found ${name} and prepared the appointment call for ${when}.`,
    needsTime: 'Tell me the preferred date/time and the patient concern, then I can prepare the call script.',
    nextCall: 'Call the provider and confirm availability, fees, documents and exact appointment time.',
    nextShare: 'Share the confirmed details with family after the provider confirms.',
    checklistDoctor: ['Patient name and age', 'Main symptom or department', 'Preferred date and time', 'Phone number for callback'],
    checklistGeneral: ['Who needs help', 'Preferred date/time', 'Address or pickup point', 'Phone number for callback'],
    call: (name) => `Call ${name}`,
    directions: 'Open directions',
    source: 'View source',
    family: 'Prepare family update',
    details: 'Add missing details',
    openScreen: (screen) =>
      ({
        calendar: 'Open my calendar',
        services: 'Open services',
        community: 'Open community',
        help: 'Open help',
        connectors: 'See what Saathi can connect',
      })[screen] || 'Open in Saathi',
    greeting: (name) => `Namaste ${name} ji.`,
    calendarReminder: (title, day, time) =>
      `Reminder: ${title} is ${day === 'today' ? 'today' : 'tomorrow'}${time ? ` at ${time}` : ''}.`,
    routeSummary: (origin, destination, estimate) =>
      `By car, ${origin} to ${destination} is roughly ${estimate} in average Siliguri traffic. Traffic can change, so open live directions before leaving.`,
    routeSafety: 'Traffic estimates can change with peak hours, road work and rain. Use live directions before leaving.',
    routeChecklist: ['Pickup point', 'Destination', 'Passenger phone number', 'Preferred leaving time'],
    routeNextSteps: ['Open live directions for the current ETA.', 'Share pickup and expected arrival time with family.'],
    liveDirections: 'Open live directions',
    safety:
      'Saathi is a coordination tool, not a medical device or doctor. It does not diagnose, treat, cure or prevent any condition. For symptoms or urgent concerns, call a qualified professional or emergency service.',
  },
  hi: {
    urgentSummary: 'यह तुरंत ध्यान देने वाली बात हो सकती है। कृपया अभी आपातकालीन मदद या नजदीकी अस्पताल को कॉल करें।',
    noService: 'मैं योजना बनाने में मदद कर सकता हूं, लेकिन साथी में अभी कोई मिलती-जुलती सत्यापित सेवा नहीं मिली।',
    foundService: (name) => `पहले संपर्क के लिए ${name} सबसे अच्छा विकल्प दिख रहा है।`,
    readyMedical: (name, when) => `मैंने ${name} चुना है और ${when} के लिए अपॉइंटमेंट कॉल तैयार कर दी है।`,
    needsTime: 'पसंदीदा तारीख/समय और मरीज की समस्या बताएं, फिर मैं कॉल की बात तैयार कर दूंगा।',
    nextCall: 'प्रदाता को कॉल करके उपलब्धता, शुल्क, जरूरी कागज और सही अपॉइंटमेंट समय पक्का करें।',
    nextShare: 'प्रदाता से पुष्टि के बाद विवरण परिवार के साथ साझा करें।',
    checklistDoctor: ['मरीज का नाम और उम्र', 'मुख्य समस्या या विभाग', 'पसंदीदा तारीख और समय', 'कॉल-बैक फोन नंबर'],
    checklistGeneral: ['किसे मदद चाहिए', 'पसंदीदा तारीख/समय', 'पता या पिकअप स्थान', 'कॉल-बैक फोन नंबर'],
    call: (name) => `${name} को कॉल करें`,
    directions: 'रास्ता खोलें',
    source: 'स्रोत देखें',
    family: 'परिवार अपडेट तैयार करें',
    details: 'बाकी जानकारी जोड़ें',
    openScreen: (screen) =>
      ({
        calendar: 'मेरा कैलेंडर खोलें',
        services: 'सेवाएं खोलें',
        community: 'कम्युनिटी खोलें',
        help: 'मदद खोलें',
        connectors: 'देखें साथी किनसे जुड़ सकता है',
      })[screen] || 'साथी में खोलें',
    greeting: (name) => `नमस्ते ${name} जी।`,
    calendarReminder: (title, day, time) =>
      `याद दिला दूं: ${title} ${day === 'today' ? 'आज' : 'कल'}${time ? ` ${time} बजे` : ''} है।`,
    safety:
      'साथी समन्वय में मदद करता है; यह डॉक्टर या मेडिकल डिवाइस नहीं है। यह निदान, इलाज या दवा की सलाह नहीं देता। लक्षण या आपात चिंता हो तो डॉक्टर, अस्पताल या आपातकालीन सेवा को कॉल करें।',
  },
};

// Layered rate limiting sized for a fixed-budget LLM plan (OpenCode Go):
// 1) In-memory per-IP burst brake — hard 429, per serverless instance only.
// 2) Per-IP AI ceiling — above it the request still succeeds via the local planner.
// 3) Durable daily caps (per-user and global) counted from assistant_events, so they
//    hold across serverless instances. Exceeding them also degrades to the local
//    planner instead of erroring — elderly users should never see a hard failure.
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 12;
const AI_PER_MINUTE_ANON = 4;
const AI_PER_MINUTE_AUTHED = 10;
const AI_USER_DAILY_MAX = Number(process.env.AI_USER_DAILY_MAX || 120);
const AI_GLOBAL_DAILY_MAX = Number(process.env.AI_GLOBAL_DAILY_MAX || 1200);
const GLOBAL_AI_COUNT_TTL_MS = 60_000;

const rateLimitHits = new Map();

function trackRequest(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((ts) => now - ts < BURST_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  if (rateLimitHits.size > 1000) {
    for (const [key, timestamps] of rateLimitHits) {
      if (!timestamps.some((ts) => now - ts < BURST_WINDOW_MS)) rateLimitHits.delete(key);
    }
  }
  return hits.length;
}

let globalAiCountCache = { value: 0, fetchedAt: 0 };

async function aiDailyQuotaOk(userId) {
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const client = adminClient();
    const now = Date.now();
    if (now - globalAiCountCache.fetchedAt > GLOBAL_AI_COUNT_TTL_MS) {
      const { count } = await client
        .from('assistant_events')
        .select('id', { count: 'exact', head: true })
        .neq('source', 'local')
        .gte('created_at', since);
      globalAiCountCache = { value: count || 0, fetchedAt: now };
    }
    if (globalAiCountCache.value >= AI_GLOBAL_DAILY_MAX) return false;
    if (userId) {
      const { count } = await client
        .from('assistant_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);
      if ((count || 0) >= AI_USER_DAILY_MAX) return false;
    }
    return true;
  } catch {
    // Quota accounting must never take the assistant down.
    return true;
  }
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const ip =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const requestsInWindow = trackRequest(ip);
    if (requestsInWindow > BURST_MAX) {
      return send(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
    }

    let userId = null;
    const hasToken = Boolean(String(req.headers.authorization || req.headers.Authorization || '').trim());
    if (hasToken) {
      const auth = await authenticate(req);
      if (auth.error) return send(res, 401, { error: 'Session expired. Please sign in again.' });
      userId = auth.user.id;
    }

    const body = await readBody(req);
    const message = String(body.message || '').trim().slice(0, 2000);
    const lang = body.lang === 'hi' ? 'hi' : 'en';
    const services = sanitizeServices(Array.isArray(body.services) ? body.services : []);
    const imageAttachments = sanitizeImageAttachments(body.imageAttachments);
    const context = sanitizeContext(body.context);

    if (!message && !imageAttachments.length) {
      return send(res, 400, { error: 'Tell Saathi what you need.' });
    }

    const effectiveMessage = message || imageOnlyFallbackText(lang);
    const urgent = URGENT_WORDS.some((word) => effectiveMessage.toLowerCase().includes(word));
    const route = urgent || imageAttachments.length ? null : extractRouteTimeRequest(effectiveMessage, services);
    if (route) {
      const plan = buildRouteTimePlan(route);
      await logAssistantEvent(userId, { message: effectiveMessage, imageCount: imageAttachments.length, plan });
      return send(res, 200, plan);
    }

    const provider = pickLlmProvider(imageAttachments);
    const aiPerMinute = userId ? AI_PER_MINUTE_AUTHED : AI_PER_MINUTE_ANON;
    const aiEligible = provider && requestsInWindow <= aiPerMinute && (await aiDailyQuotaOk(userId));

    if (aiEligible) {
      const planner = provider === 'deepseek' ? planWithDeepSeek : planWithOpenAI;
      const aiPlan = await planner({
        message: message || imageOnlyVisionPrompt(lang),
        lang,
        services,
        imageAttachments,
        context,
        urgent,
      }).catch(() => null);
      if (aiPlan) {
        globalAiCountCache.value += 1;
        await logAssistantEvent(userId, { message, imageCount: imageAttachments.length, plan: aiPlan });
        return send(res, 200, aiPlan);
      }
    }

    const plan = buildLocalAssistantPlan(effectiveMessage, services, lang, context);
    await logAssistantEvent(userId, { message: effectiveMessage, imageCount: imageAttachments.length, plan });
    return send(res, 200, plan);
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not plan this request.' });
  }
};

function pickLlmProvider(imageAttachments) {
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  // DeepSeek V4 Flash is text-only, so requests with photos go to OpenAI when possible.
  if (imageAttachments.length && hasOpenAI) return 'openai';
  if (hasDeepSeek) return 'deepseek';
  if (hasOpenAI) return 'openai';
  return null;
}

function buildSystemPrompt(urgent) {
  return (
    'You are Saathi, a care coordination agent for elderly users in India. Use only the services provided by the app. You are not a doctor, medical device, diagnostic tool, emergency responder, or booking authority. Never diagnose, prescribe, triage, interpret symptoms as a clinician, or claim an appointment is booked until a provider confirms it. For urgent symptoms, tell the user to call emergency help or a hospital. If the user asks about ride time, traffic, ETA or directions to a listed place, answer the route question and do not treat the destination as a provider to call. Return compact JSON only.' +
    (urgent
      ? ' URGENT: the message contains emergency symptoms. Set status to "urgent" and tell the user to call emergency help or the nearest hospital first, before answering anything else (including route or traffic questions).'
      : '')
  );
}

function buildRequestPayload({ message, lang, services, imageAttachments, context }) {
  return {
    message,
    language: lang,
    context: context || undefined,
    imageCount: imageAttachments.length,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      description: service.description,
      phone: service.phone,
      address: service.address,
      hours: service.hours,
      verified: service.verified,
      town: service.town,
      verification_status: service.verification_status,
      verified_at: service.verified_at,
      phone_confirmed: service.phone_confirmed,
      claim_status: service.claim_status,
      service_area: service.service_area,
    })),
  };
}

const PLAN_JSON_INSTRUCTIONS =
  'Respond with exactly one JSON object, no markdown fences, using these keys: ' +
  '"intent" (one of "medical_appointment","medicine_delivery","transport","elder_care","daily_help","general"), ' +
  '"status" (one of "needs_details","ready_to_call","urgent","handoff"), ' +
  '"summary" (short string in the user\'s language), ' +
  '"followUpQuestion" (string or null), ' +
  '"safetyNote" (string), ' +
  '"suggestedServiceIds" (array of at most 3 ids taken only from the provided services), ' +
  '"checklist" (array of at most 5 short strings), ' +
  '"nextSteps" (array of at most 4 short strings), ' +
  '"actions" (array of at most 4 objects, each {"kind":"call"|"directions"|"source"|"family_update"|"details","label":string,"value":string|null,"serviceId":string|null}). ' +
  'No other keys.';

async function planWithDeepSeek({ message, lang, services, imageAttachments, context, urgent }) {
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `${buildSystemPrompt(urgent)} ${PLAN_JSON_INSTRUCTIONS}` },
        { role: 'user', content: JSON.stringify(buildRequestPayload({ message, lang, services, imageAttachments, context })) },
      ],
      response_format: { type: 'json_object' },
      // DeepSeek V4 hybrid thinking mode: disabled keeps replies fast enough for chat.
      thinking: { type: 'disabled' },
      temperature: 0.3,
      max_tokens: 900,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const raw = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!raw) return null;

  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(text);
  return normalizeModelPlan(parsed, services, lang, { message, context, urgent, source: 'deepseek' });
}

async function planWithOpenAI({ message, lang, services, imageAttachments, context, urgent }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const userContent = [
    {
      type: 'input_text',
      text: JSON.stringify(buildRequestPayload({ message, lang, services, imageAttachments, context })),
    },
    ...imageAttachments.map((attachment) => ({
      type: 'input_image',
      image_url: attachment.uri,
      detail: 'low',
    })),
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'developer',
          content: buildSystemPrompt(urgent),
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'saathi_assistant_plan',
          strict: false,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'intent',
              'status',
              'summary',
              'followUpQuestion',
              'safetyNote',
              'suggestedServiceIds',
              'checklist',
              'nextSteps',
              'actions',
            ],
            properties: {
              intent: {
                type: 'string',
                enum: ['medical_appointment', 'medicine_delivery', 'transport', 'elder_care', 'daily_help', 'general'],
              },
              status: { type: 'string', enum: ['needs_details', 'ready_to_call', 'urgent', 'handoff'] },
              summary: { type: 'string' },
              followUpQuestion: { type: ['string', 'null'] },
              safetyNote: { type: 'string' },
              suggestedServiceIds: { type: 'array', items: { type: 'string' }, maxItems: 3 },
              checklist: { type: 'array', items: { type: 'string' }, maxItems: 5 },
              nextSteps: { type: 'array', items: { type: 'string' }, maxItems: 4 },
              actions: {
                type: 'array',
                maxItems: 4,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind', 'label', 'value', 'serviceId'],
                  properties: {
                    kind: { type: 'string', enum: ['call', 'directions', 'source', 'family_update', 'details'] },
                    label: { type: 'string' },
                    value: { type: ['string', 'null'] },
                    serviceId: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const text = extractOutputText(data);
  if (!text) return null;

  const parsed = JSON.parse(text);
  return normalizeModelPlan(parsed, services, lang, { message, context, urgent, source: 'openai' });
}

async function logAssistantEvent(userId, { message, imageCount, plan }) {
  try {
    const serviceIds = (plan.suggestedServices || [])
      .map((service) => String(service.id || ''))
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    await adminClient().from('assistant_events').insert({
      user_id: userId || null,
      prompt_text: String(message || '').slice(0, 800),
      source: plan.source,
      intent: plan.intent,
      status: plan.status,
      service_ids: serviceIds,
      image_count: Number(imageCount || 0),
    });
  } catch {
    // Logging is useful for safety review, but planning should never fail because logging is unavailable.
  }
}

function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const output of data.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function normalizeModelPlan(plan, services, lang, { message, context, urgent, source } = {}) {
  // Fallback intent/status must come from the USER message, never from LLM output,
  // otherwise a prompt-injected summary could steer the keyword fallback.
  const local = buildLocalAssistantPlan(message || '', services, lang, context || null);
  const byId = new Map(services.map((service) => [service.id, service]));
  const suggestedServices = (Array.isArray(plan.suggestedServiceIds) ? plan.suggestedServiceIds : [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .slice(0, 3);
  const fallbackServices = suggestedServices.length ? suggestedServices : local.suggestedServices;

  return {
    source: source || 'openai',
    intent: safeEnum(plan.intent, ['medical_appointment', 'medicine_delivery', 'transport', 'elder_care', 'daily_help', 'general'], local.intent),
    status: urgent ? 'urgent' : safeEnum(plan.status, ['needs_details', 'ready_to_call', 'urgent', 'handoff'], local.status),
    summary: String(plan.summary || local.summary),
    followUpQuestion: plan.followUpQuestion ? String(plan.followUpQuestion) : null,
    safetyNote: String(plan.safetyNote || local.safetyNote),
    suggestedServices: fallbackServices,
    checklist: safeStringList(plan.checklist, local.checklist, 5),
    nextSteps: safeStringList(plan.nextSteps, local.nextSteps, 4),
    actions: normalizeActions(plan.actions, fallbackServices, lang),
  };
}

function normalizeActions(actions, services, lang) {
  const copy = COPY[lang] || COPY.en;
  const byId = new Map(services.map((service) => [service.id, service]));
  const normalized = Array.isArray(actions)
    ? actions
        .map((action) => {
          const kind = safeEnum(action.kind, ['call', 'directions', 'source', 'family_update', 'details'], 'details');
          const service = action.serviceId ? byId.get(String(action.serviceId)) || null : null;
          // Drop service-bound actions with a missing/unknown serviceId instead of
          // defaulting to services[0], which would let the LLM dial an arbitrary provider.
          if (!service && (kind === 'call' || kind === 'directions' || kind === 'source')) return null;
          const value =
            kind === 'call'
              ? service?.phone
              : kind === 'directions'
                ? service?.map_url
                : kind === 'source'
                  ? service?.source_url
                  : action.value;
          return {
            kind,
            label: String(action.label || defaultActionLabel(kind, service, copy)),
            value: value || null,
            serviceId: service?.id || null,
          };
        })
        .filter(Boolean)
        .slice(0, 4)
    : [];

  if (normalized.length) return normalized;
  return buildLocalAssistantPlan('', services, lang).actions;
}

function defaultActionLabel(kind, service, copy) {
  if (kind === 'call' && service) return copy.call(service.name);
  if (kind === 'directions') return copy.directions;
  if (kind === 'source') return copy.source;
  if (kind === 'family_update') return copy.family;
  return copy.details;
}

function buildLocalAssistantPlan(message, services, lang = 'en', context = null) {
  const copy = COPY[lang] || COPY.en;
  const normalized = String(message || '').toLowerCase();
  const urgent = URGENT_WORDS.some((word) => normalized.includes(word));
  const route = urgent ? null : extractRouteTimeRequest(message, services);
  if (route) return buildRouteTimePlan(route);
  const intent = detectIntent(normalized, urgent);
  const category = categoryForIntent(intent, urgent, normalized);
  const when = extractWhen(message);
  const suggestedServices = rankServices(services, category, normalized).slice(0, 3);
  const primary = suggestedServices[0] || null;
  const needsDetails = intent === 'medical_appointment' && !when && !urgent;
  const wantsCalendarScreen = matchesAny(normalized, CALENDAR_SCREEN_WORDS);
  const wantsConnectorScreen = matchesAny(normalized, CONNECTOR_SCREEN_WORDS);

  const actions = [];
  if (primary?.phone) actions.push({ kind: 'call', label: copy.call(primary.name), value: primary.phone, serviceId: primary.id });
  if (primary?.map_url) actions.push({ kind: 'directions', label: copy.directions, value: primary.map_url, serviceId: primary.id });
  if (primary?.source_url) actions.push({ kind: 'source', label: copy.source, value: primary.source_url, serviceId: primary.id });
  if (wantsCalendarScreen) {
    actions.push({ kind: 'open_screen', label: copy.openScreen('calendar'), value: JSON.stringify({ screen: 'calendar' }), serviceId: null });
  }
  if (wantsConnectorScreen) {
    actions.push({ kind: 'open_screen', label: copy.openScreen('connectors'), value: JSON.stringify({ screen: 'connectors' }), serviceId: null });
  }
  actions.push({ kind: needsDetails ? 'details' : 'family_update', label: needsDetails ? copy.details : copy.family, value: null, serviceId: null });

  const baseSummary = urgent
    ? copy.urgentSummary
    : primary
      ? when && intent === 'medical_appointment'
        ? copy.readyMedical(primary.name, when)
        : copy.foundService(primary.name)
      : copy.noService;
  const upcoming = !urgent && wantsCalendarScreen ? upcomingCalendarEntry(context) : null;
  const summaryParts = [];
  if (!urgent && context?.profile?.name) summaryParts.push(copy.greeting(context.profile.name));
  summaryParts.push(baseSummary);
  if (upcoming) summaryParts.push(copy.calendarReminder(upcoming.title, upcoming.day, upcoming.time));

  return {
    source: 'local',
    intent,
    status: urgent ? 'urgent' : needsDetails ? 'needs_details' : primary ? 'ready_to_call' : 'handoff',
    summary: summaryParts.join(' '),
    followUpQuestion: needsDetails ? copy.needsTime : null,
    safetyNote: copy.safety,
    suggestedServices,
    checklist: intent === 'medical_appointment' ? copy.checklistDoctor : copy.checklistGeneral,
    nextSteps: [copy.nextCall, copy.nextShare],
    actions,
  };
}

function detectIntent(normalized, urgent) {
  if (urgent) return 'medical_appointment';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.medical_shop)) return 'medicine_delivery';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.travel_agent)) return 'transport';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.elder_home)) return 'elder_care';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.home_service)) return 'daily_help';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.daily_service)) return 'daily_help';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.doctor) || matchesAny(normalized, CATEGORY_KEYWORDS.hospital)) {
    return 'medical_appointment';
  }
  return 'general';
}

function categoryForIntent(intent, urgent, normalized = '') {
  if (urgent) return 'hospital';
  if (intent === 'medical_appointment') return 'doctor';
  if (intent === 'medicine_delivery') return 'medical_shop';
  if (intent === 'transport') return 'travel_agent';
  if (intent === 'elder_care') return 'elder_home';
  if (intent === 'daily_help' && matchesAny(normalized, CATEGORY_KEYWORDS.home_service)) return 'home_service';
  if (intent === 'daily_help') return 'daily_service';
  return null;
}

function rankServices(services, preferred, normalized) {
  return [...services]
    .map((service) => {
      const relevance =
        (preferred && service.category === preferred ? 50 : 0) +
        (service.name && normalized.includes(service.name.toLowerCase().split(' ')[0]) ? 10 : 0) +
        (service.description ? wordOverlap(normalized, service.description.toLowerCase()) : 0);
      return {
        service,
        // Verified/phone bonuses only rank services that actually match the request;
        // without this, a generic "hello" would ready_to_call a random provider.
        score: relevance > 0 ? relevance + (service.verified ? 12 : 0) + (service.phone ? 8 : 0) : 0,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.service);
}

function matchesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function wordOverlap(a, b) {
  return a.split(/\W+/).filter((word) => word.length > 3 && b.includes(word)).length;
}

function extractWhen(message) {
  const matches = String(message || '').match(
    /\b(today|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi,
  );
  return matches?.slice(0, 3).join(' ') || '';
}

function upcomingCalendarEntry(context) {
  const entries = context?.calendar || [];
  if (!entries.length) return null;
  const todayKey =
    context?.todayISO && /^\d{4}-\d{2}-\d{2}$/.test(context.todayISO) ? context.todayISO : localISODate(new Date());
  const tomorrowKey = nextDateKey(todayKey);
  for (const entry of entries) {
    const dateKey = String(entry.dateISO || '').slice(0, 10);
    if (dateKey === todayKey) return { title: entry.title, time: entry.time || null, day: 'today' };
    if (dateKey === tomorrowKey) return { title: entry.title, time: entry.time || null, day: 'tomorrow' };
  }
  return null;
}

function nextDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return localISODate(new Date(year, month - 1, day + 1));
}

function localISODate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildRouteTimePlan(route) {
  const copy = COPY.en;
  return {
    source: 'local',
    intent: 'transport',
    status: 'handoff',
    summary: copy.routeSummary(route.origin.display, route.destination.display, route.estimate),
    followUpQuestion: null,
    safetyNote: copy.routeSafety,
    suggestedServices: [],
    checklist: copy.routeChecklist,
    nextSteps: copy.routeNextSteps,
    actions: [
      {
        kind: 'directions',
        label: copy.liveDirections,
        value: route.directionsUrl,
        serviceId: route.destination.serviceId,
      },
    ],
  };
}

function extractRouteTimeRequest(message, services) {
  const normalized = String(message || '').toLowerCase();
  if (!ROUTE_TIME_WORDS.some((word) => normalized.includes(word))) return null;

  const places = extractRoutePlaces(String(message || ''));
  if (!places) return null;

  const originRaw = cleanRoutePlace(places.origin);
  const destinationRaw = cleanRoutePlace(places.destination);
  if (!originRaw || !destinationRaw) return null;

  const origin = resolveRoutePlace(originRaw, services);
  const destination = resolveRoutePlace(destinationRaw, services);
  const estimate = estimateRouteTime(origin, destination);
  const directionsUrl = buildDirectionsUrl(origin.query, destination.query);

  return { origin, destination, estimate, directionsUrl };
}

function extractRoutePlaces(message) {
  const fromTo = message.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!]|$)/i);
  if (fromTo) return { origin: fromTo[1], destination: fromTo[2] };

  const toFrom = message.match(/\bto\s+(.+?)\s+from\s+(.+?)(?:[?.!]|$)/i);
  if (toFrom) return { origin: toFrom[2], destination: toFrom[1] };

  return null;
}

function cleanRoutePlace(value) {
  return String(value || '')
    .trim()
    .replace(/\s+(?:during|in|with)\s+(?:average\s+)?traffic.*$/i, '')
    .replace(/[,\s.?!;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

function resolveRoutePlace(raw, services) {
  const aliasMatch = matchKnownPlaceAlias(raw, services);
  if (aliasMatch) return serviceToRoutePlace(aliasMatch);

  const ranked = services
    .map((service) => ({ service, score: placeMatchScore(raw, service.name) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && best.score >= 5) return serviceToRoutePlace(best.service);

  return {
    display: titleRoutePlace(raw),
    query: ensureSiliguriQuery(raw),
    serviceId: null,
  };
}

function matchKnownPlaceAlias(raw, services) {
  const normalized = normalizePlace(raw);
  const aliases = [
    {
      serviceName: 'Siliguri Bhawna Society',
      terms: ['siliguri bhawna society', 'siliguri bhana society', 'bhawna society', 'bhana society'],
    },
    {
      serviceName: 'Shanti Mindcare Old Age Care',
      terms: ['shanti mindcare', 'shanti mindacar', 'mindcare', 'mindacar'],
    },
  ];

  const match = aliases.find((item) => item.terms.some((term) => normalized.includes(normalizePlace(term))));
  return match ? services.find((service) => service.name === match.serviceName) || null : null;
}

function serviceToRoutePlace(service) {
  return {
    display: service.name,
    query: [service.name, service.address].filter(Boolean).join(', '),
    serviceId: service.id,
  };
}

function placeMatchScore(raw, serviceName) {
  const rawTokens = tokenizePlace(raw);
  const serviceTokens = tokenizePlace(serviceName);
  let score = 0;

  for (const rawToken of rawTokens) {
    let tokenScore = 0;
    for (const serviceToken of serviceTokens) {
      if (rawToken === serviceToken) tokenScore = Math.max(tokenScore, 3);
      else if (rawToken.length >= 5 && serviceToken.length >= 5 && editDistance(rawToken, serviceToken) <= 2) {
        tokenScore = Math.max(tokenScore, 2);
      } else if (
        rawToken.length >= 4 &&
        serviceToken.length >= 4 &&
        (rawToken.startsWith(serviceToken) || serviceToken.startsWith(rawToken))
      ) {
        tokenScore = Math.max(tokenScore, 1);
      }
    }
    score += tokenScore;
  }

  return score;
}

function estimateRouteTime(origin, destination) {
  const pair = `${normalizePlace(origin.display)} -> ${normalizePlace(destination.display)}`;
  if (
    pair.includes('siliguri bhawna society -> shanti mindcare old age care') ||
    pair.includes('shanti mindcare old age care -> siliguri bhawna society')
  ) {
    return '25-40 minutes';
  }
  if (pair.includes('bagdogra airport') && pair.includes('siliguri bhawna society')) {
    return '30-50 minutes';
  }
  return '20-45 minutes';
}

function buildDirectionsUrl(origin, destination) {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function ensureSiliguriQuery(place) {
  return /\bsiliguri\b/i.test(place) ? place : `${place}, Siliguri`;
}

function titleRoutePlace(place) {
  return String(place || '')
    .split(' ')
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function tokenizePlace(value) {
  return normalizePlace(value)
    .split(' ')
    .filter((word) => word.length > 2);
}

function normalizePlace(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= b.length; column += 1) rows[0][column] = column;

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      rows[row][column] =
        a[row - 1] === b[column - 1]
          ? rows[row - 1][column - 1]
          : 1 + Math.min(rows[row - 1][column], rows[row][column - 1], rows[row - 1][column - 1]);
    }
  }

  return rows[a.length][b.length];
}

function sanitizeServices(services) {
  return services
    .map((service) => ({
      id: String(service.id || ''),
      name: String(service.name || ''),
      category: String(service.category || 'daily_service'),
      description: service.description ? String(service.description) : null,
      phone: service.phone ? String(service.phone) : null,
      address: service.address ? String(service.address) : null,
      map_url: service.map_url ? String(service.map_url) : null,
      image_url: service.image_url ? String(service.image_url) : null,
      hours: service.hours ? String(service.hours) : null,
      rating: typeof service.rating === 'number' ? service.rating : null,
      verified: Boolean(service.verified),
      town: service.town ? String(service.town) : null,
      source_url: service.source_url ? String(service.source_url) : null,
      verification_status: service.verification_status ? String(service.verification_status) : null,
      verified_at: service.verified_at ? String(service.verified_at) : null,
      phone_confirmed: Boolean(service.phone_confirmed),
      claim_status: service.claim_status ? String(service.claim_status) : null,
      service_area: service.service_area ? String(service.service_area) : null,
      created_at: service.created_at ? String(service.created_at) : null,
      upi_id: service.upi_id ? String(service.upi_id) : null,
      city_id: service.city_id ? String(service.city_id) : null,
    }))
    .filter((service) => service.id && service.name)
    .slice(0, 60);
}

function sanitizeContext(value) {
  if (!value || typeof value !== 'object') return null;
  const profile =
    value.profile && typeof value.profile === 'object'
      ? {
          name: value.profile.name ? String(value.profile.name).slice(0, 80) : undefined,
          city: value.profile.city ? String(value.profile.city).slice(0, 80) : undefined,
        }
      : undefined;
  const calendar = Array.isArray(value.calendar)
    ? value.calendar
        .map((entry) => ({
          title: String(entry?.title || '').slice(0, 120),
          dateISO: String(entry?.dateISO || '').slice(0, 10),
          time: entry?.time ? String(entry.time).slice(0, 20) : null,
        }))
        .filter((entry) => entry.title && entry.dateISO)
        .slice(0, 20)
    : undefined;
  const todayISO = typeof value.todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.todayISO) ? value.todayISO : undefined;
  const facts = Array.isArray(value.facts)
    ? value.facts.map((fact) => String(fact || '').slice(0, 200)).filter(Boolean).slice(0, 10)
    : undefined;
  const recentTurns = Array.isArray(value.recentTurns)
    ? value.recentTurns
        .map((turn) => ({ role: String(turn?.role || ''), text: String(turn?.text || '').slice(0, 400) }))
        .filter((turn) => turn.text)
        .slice(0, 6)
    : undefined;
  if (!profile && !calendar?.length && !todayISO && !facts?.length && !recentTurns?.length) return null;
  return { profile, calendar, todayISO, facts, recentTurns };
}

function sanitizeImageAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((attachment) => ({
      id: String(attachment?.id || ''),
      type: 'image',
      uri: String(attachment?.uri || ''),
      name: attachment?.name ? String(attachment.name) : null,
      mimeType: attachment?.mimeType ? String(attachment.mimeType) : null,
      size: typeof attachment?.size === 'number' ? attachment.size : null,
    }))
    .filter((attachment) => {
      const mimeType = attachment.mimeType || '';
      return (
        attachment.uri.length < 8_000_000 &&
        (attachment.uri.startsWith('data:image/') || /^https:\/\//i.test(attachment.uri)) &&
        (!mimeType || mimeType.startsWith('image/'))
      );
    })
    .slice(0, 3);
}

function imageOnlyFallbackText(lang) {
  return lang === 'hi' ? 'Photo attached.' : 'Photo attached.';
}

function imageOnlyVisionPrompt(lang) {
  return lang === 'hi'
    ? 'The user attached a photo. Read the photo and help with the care task. Ask one short follow-up if details are missing.'
    : 'The user attached a photo. Read the photo and help with the care task. Ask one short follow-up if details are missing.';
}

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeStringList(value, fallback, limit) {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, limit);
  return list.length ? list : fallback;
}
