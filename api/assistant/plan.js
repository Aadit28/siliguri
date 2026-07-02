const { readBody, send, withCors } = require('../_lib/auth');

const CATEGORY_KEYWORDS = {
  doctor: ['doctor', 'appointment', 'opd', 'physician', 'cardio', 'heart', 'ortho', 'bone', 'medicine', 'specialist', 'clinic'],
  hospital: ['hospital', 'emergency', 'ambulance', 'admit', 'chest pain', 'stroke', 'accident', 'icu'],
  medical_shop: ['medicine', 'medicines', 'pharmacy', 'prescription', 'tablet', 'delivery', 'drug'],
  travel_agent: ['travel', 'ticket', 'train', 'flight', 'bus', 'taxi', 'ride', 'airport', 'station'],
  elder_home: ['elder', 'old age', 'care home', 'attendant', 'nursing', 'parent', 'senior'],
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
    addCalendar: 'Add to calendar',
    pay: (name) => `Pay ${name} via UPI`,
    bookRide: 'Book a ride',
    routeSummary: (origin, destination, estimate) =>
      `By car, ${origin} to ${destination} is roughly ${estimate} in average Siliguri traffic. Traffic can change, so open live directions before leaving.`,
    routeSafety: 'Traffic estimates can change with peak hours, road work and rain. Use live directions before leaving.',
    routeChecklist: ['Pickup point', 'Destination', 'Passenger phone number', 'Preferred leaving time'],
    routeNextSteps: ['Open live directions for the current ETA.', 'Share pickup and expected arrival time with family.'],
    liveDirections: 'Open live directions',
    safety:
      'Saathi can prepare the next step, but medical bookings are confirmed only after the provider or emergency service accepts them.',
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
    addCalendar: 'कैलेंडर में जोड़ें',
    pay: (name) => `${name} को UPI से भुगतान करें`,
    bookRide: 'सवारी बुक करें',
    safety:
      'साथी अगला कदम तैयार कर सकता है, लेकिन मेडिकल बुकिंग तभी पक्की है जब प्रदाता या आपातकालीन सेवा पुष्टि करे।',
  },
};

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const message = String(body.message || '').trim();
    const lang = body.lang === 'hi' ? 'hi' : 'en';
    const services = sanitizeServices(Array.isArray(body.services) ? body.services : []);
    const imageAttachments = sanitizeImageAttachments(body.imageAttachments);

    if (!message && !imageAttachments.length) {
      return send(res, 400, { error: 'Tell Saathi what you need.' });
    }

    const effectiveMessage = message || imageOnlyFallbackText(lang);
    const route = imageAttachments.length ? null : extractRouteTimeRequest(effectiveMessage, services);
    if (route) return send(res, 200, buildRouteTimePlan(route));

    if (process.env.OPENAI_API_KEY) {
      const aiPlan = await planWithOpenAI({
        message: message || imageOnlyVisionPrompt(lang),
        lang,
        services,
        imageAttachments,
      }).catch(() => null);
      if (aiPlan) return send(res, 200, aiPlan);
    }

    return send(res, 200, buildLocalAssistantPlan(effectiveMessage, services, lang));
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not plan this request.' });
  }
};

async function planWithOpenAI({ message, lang, services, imageAttachments }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const userContent = [
    {
      type: 'input_text',
      text: JSON.stringify({
        message,
        language: lang,
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
        })),
      }),
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
          content:
            'You are Saathi, a care coordination agent for elderly users in India. Use only the services provided by the app. Never claim a medical appointment is booked until a provider confirms it. For urgent symptoms, route to emergency/hospital calling. If the user asks about ride time, traffic, ETA or directions to a listed place, answer the route question and do not treat the destination as a provider to call. You may also propose add_calendar (value: JSON {"title","when"}), pay (only when the service has a UPI id), and book_ride (value: JSON {"destination"}) actions; the user must tap to approve every action. Return compact JSON only.',
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
                    kind: {
                      type: 'string',
                      enum: ['call', 'directions', 'source', 'family_update', 'details', 'add_calendar', 'pay', 'book_ride'],
                    },
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
  return normalizeOpenAIPlan(parsed, services, lang);
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

function normalizeOpenAIPlan(plan, services, lang) {
  const local = buildLocalAssistantPlan(plan.summary || '', services, lang);
  const byId = new Map(services.map((service) => [service.id, service]));
  const suggestedServices = (Array.isArray(plan.suggestedServiceIds) ? plan.suggestedServiceIds : [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .slice(0, 3);
  const fallbackServices = suggestedServices.length ? suggestedServices : local.suggestedServices;

  return {
    source: 'openai',
    intent: safeEnum(plan.intent, ['medical_appointment', 'medicine_delivery', 'transport', 'elder_care', 'daily_help', 'general'], local.intent),
    status: safeEnum(plan.status, ['needs_details', 'ready_to_call', 'urgent', 'handoff'], local.status),
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
          const kind = safeEnum(
            action.kind,
            ['call', 'directions', 'source', 'family_update', 'details', 'add_calendar', 'pay', 'book_ride'],
            'details',
          );
          const service = action.serviceId ? byId.get(String(action.serviceId)) : services[0];
          const value =
            kind === 'call'
              ? service?.phone
              : kind === 'directions'
                ? service?.map_url
                : kind === 'source'
                  ? service?.source_url
                  : kind === 'pay'
                    ? service?.upi_id
                      ? String(service.upi_id)
                      : null
                    : action.value;
          return {
            kind,
            label: String(action.label || defaultActionLabel(kind, service, copy)),
            value: value || null,
            serviceId: service?.id || null,
          };
        })
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
  if (kind === 'add_calendar') return copy.addCalendar;
  if (kind === 'pay') return copy.pay(service?.name || '');
  if (kind === 'book_ride') return copy.bookRide;
  return copy.details;
}

function buildLocalAssistantPlan(message, services, lang = 'en') {
  const copy = COPY[lang] || COPY.en;
  const normalized = String(message || '').toLowerCase();
  const urgent = URGENT_WORDS.some((word) => normalized.includes(word));
  const route = urgent ? null : extractRouteTimeRequest(message, services);
  if (route) return buildRouteTimePlan(route);
  const intent = detectIntent(normalized, urgent);
  const category = categoryForIntent(intent, urgent);
  const when = extractWhen(message);
  const suggestedServices = rankServices(services, category, normalized).slice(0, 3);
  const primary = suggestedServices[0] || null;
  const needsDetails = intent === 'medical_appointment' && !when && !urgent;

  const actions = [];
  if (primary?.phone) actions.push({ kind: 'call', label: copy.call(primary.name), value: primary.phone, serviceId: primary.id });
  if (primary?.map_url) actions.push({ kind: 'directions', label: copy.directions, value: primary.map_url, serviceId: primary.id });
  if (primary?.source_url) actions.push({ kind: 'source', label: copy.source, value: primary.source_url, serviceId: primary.id });
  if (when && intent === 'medical_appointment' && primary) {
    actions.push({
      kind: 'add_calendar',
      label: copy.addCalendar,
      value: JSON.stringify({ title: primary.name, when }),
      serviceId: primary.id,
    });
  }
  if (primary?.upi_id) {
    actions.push({ kind: 'pay', label: copy.pay(primary.name), value: primary.upi_id, serviceId: primary.id });
  }
  if (intent === 'transport' && primary) {
    actions.push({
      kind: 'book_ride',
      label: copy.bookRide,
      value: JSON.stringify({ destination: [primary.name, primary.address].filter(Boolean).join(', ') }),
      serviceId: primary.id,
    });
  }
  actions.push({ kind: needsDetails ? 'details' : 'family_update', label: needsDetails ? copy.details : copy.family, value: null, serviceId: null });

  return {
    source: 'local',
    intent,
    status: urgent ? 'urgent' : needsDetails ? 'needs_details' : primary ? 'ready_to_call' : 'handoff',
    summary: urgent
      ? copy.urgentSummary
      : primary
        ? when && intent === 'medical_appointment'
          ? copy.readyMedical(primary.name, when)
          : copy.foundService(primary.name)
        : copy.noService,
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
  if (matchesAny(normalized, CATEGORY_KEYWORDS.daily_service)) return 'daily_help';
  if (matchesAny(normalized, CATEGORY_KEYWORDS.doctor) || matchesAny(normalized, CATEGORY_KEYWORDS.hospital)) {
    return 'medical_appointment';
  }
  return 'general';
}

function categoryForIntent(intent, urgent) {
  if (urgent) return 'hospital';
  if (intent === 'medical_appointment') return 'doctor';
  if (intent === 'medicine_delivery') return 'medical_shop';
  if (intent === 'transport') return 'travel_agent';
  if (intent === 'elder_care') return 'elder_home';
  if (intent === 'daily_help') return 'daily_service';
  return null;
}

function rankServices(services, preferred, normalized) {
  return [...services]
    .map((service) => ({
      service,
      score:
        (preferred && service.category === preferred ? 50 : 0) +
        (service.verified ? 12 : 0) +
        (service.phone ? 8 : 0) +
        (service.name && normalized.includes(service.name.toLowerCase().split(' ')[0]) ? 10 : 0) +
        (service.description ? wordOverlap(normalized, service.description.toLowerCase()) : 0),
    }))
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
      upi_id: service.upi_id ? String(service.upi_id) : null,
      rating: typeof service.rating === 'number' ? service.rating : null,
      verified: Boolean(service.verified),
      town: service.town ? String(service.town) : null,
      source_url: service.source_url ? String(service.source_url) : null,
    }))
    .filter((service) => service.id && service.name)
    .slice(0, 60);
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
