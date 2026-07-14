import { backendRequest } from './backend';
import { toLocalISODate } from './calendar';
import { Service, ServiceCategory } from './types';

export type AssistantIntent =
  | 'medical_appointment'
  | 'medicine_delivery'
  | 'transport'
  | 'elder_care'
  | 'daily_help'
  | 'general';

export type AssistantStatus = 'needs_details' | 'ready_to_call' | 'urgent' | 'handoff';

export type AssistantActionKind =
  | 'call'
  | 'directions'
  | 'source'
  | 'family_update'
  | 'details'
  | 'add_calendar'
  | 'pay'
  | 'book_ride'
  | 'open_screen';

export interface AssistantAction {
  kind: AssistantActionKind;
  label: string;
  value?: string | null;
  serviceId?: string | null;
}

export interface AssistantPlan {
  source: 'openai' | 'local';
  intent: AssistantIntent;
  status: AssistantStatus;
  summary: string;
  followUpQuestion: string | null;
  safetyNote: string;
  suggestedServices: Service[];
  checklist: string[];
  nextSteps: string[];
  actions: AssistantAction[];
}

export interface AssistantAttachment {
  id: string;
  type: 'image';
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: AssistantAttachment[];
  plan?: AssistantPlan;
}

export interface AssistantPlanContext {
  profile?: { name?: string; city?: string };
  calendar?: { title: string; dateISO: string; time?: string | null }[];
  todayISO?: string;
  facts?: string[];
  recentTurns?: { role: string; text: string }[];
}

type AssistantLang = 'en' | 'hi';

const CATEGORY_KEYWORDS: Record<ServiceCategory, string[]> = {
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
    foundService: (name: string) => `I found ${name} as the best first contact.`,
    readyMedical: (name: string, when: string) =>
      `I found ${name} and prepared the appointment call for ${when}.`,
    needsTime: 'Tell me the preferred date/time and the patient concern, then I can prepare the call script.',
    nextCall: 'Call the provider and confirm availability, fees, documents and exact appointment time.',
    nextShare: 'Share the confirmed details with family after the provider confirms.',
    checklistDoctor: ['Patient name and age', 'Main symptom or department', 'Preferred date and time', 'Phone number for callback'],
    checklistGeneral: ['Who needs help', 'Preferred date/time', 'Address or pickup point', 'Phone number for callback'],
    call: (name: string) => `Call ${name}`,
    directions: 'Open directions',
    source: 'View source',
    family: 'Prepare family update',
    details: 'Add missing details',
    addCalendar: 'Add to calendar',
    pay: (name: string) => `Pay ${name} via UPI`,
    bookRide: 'Book a ride',
    openScreen: (screen: string) =>
      (
        {
          calendar: 'Open my calendar',
          services: 'Open services',
          community: 'Open community',
          help: 'Open help',
          connectors: 'See what Saathi can connect',
        } as Record<string, string>
      )[screen] || 'Open in Saathi',
    greeting: (name: string) => `Namaste ${name} ji.`,
    calendarReminder: (title: string, day: string, time: string | null) =>
      `Reminder: ${title} is ${day === 'today' ? 'today' : 'tomorrow'}${time ? ` at ${time}` : ''}.`,
    routeSummary: (origin: string, destination: string, estimate: string) =>
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
    foundService: (name: string) => `पहले संपर्क के लिए ${name} सबसे अच्छा विकल्प दिख रहा है।`,
    readyMedical: (name: string, when: string) => `मैंने ${name} चुना है और ${when} के लिए अपॉइंटमेंट कॉल तैयार कर दी है।`,
    needsTime: 'पसंदीदा तारीख/समय और मरीज की समस्या बताएं, फिर मैं कॉल की बात तैयार कर दूंगा।',
    nextCall: 'प्रदाता को कॉल करके उपलब्धता, शुल्क, जरूरी कागज और सही अपॉइंटमेंट समय पक्का करें।',
    nextShare: 'प्रदाता से पुष्टि के बाद विवरण परिवार के साथ साझा करें।',
    checklistDoctor: ['मरीज का नाम और उम्र', 'मुख्य समस्या या विभाग', 'पसंदीदा तारीख और समय', 'कॉल-बैक फोन नंबर'],
    checklistGeneral: ['किसे मदद चाहिए', 'पसंदीदा तारीख/समय', 'पता या पिकअप स्थान', 'कॉल-बैक फोन नंबर'],
    call: (name: string) => `${name} को कॉल करें`,
    directions: 'रास्ता खोलें',
    source: 'स्रोत देखें',
    family: 'परिवार अपडेट तैयार करें',
    details: 'बाकी जानकारी जोड़ें',
    addCalendar: 'कैलेंडर में जोड़ें',
    pay: (name: string) => `${name} को UPI से भुगतान करें`,
    bookRide: 'सवारी बुक करें',
    openScreen: (screen: string) =>
      (
        {
          calendar: 'मेरा कैलेंडर खोलें',
          services: 'सेवाएं खोलें',
          community: 'कम्युनिटी खोलें',
          help: 'मदद खोलें',
          connectors: 'देखें साथी किनसे जुड़ सकता है',
        } as Record<string, string>
      )[screen] || 'साथी में खोलें',
    greeting: (name: string) => `नमस्ते ${name} जी।`,
    calendarReminder: (title: string, day: string, time: string | null) =>
      `याद दिला दूं: ${title} ${day === 'today' ? 'आज' : 'कल'}${time ? ` ${time} बजे` : ''} है।`,
    safety:
      'साथी समन्वय में मदद करता है; यह डॉक्टर या मेडिकल डिवाइस नहीं है। यह निदान, इलाज या दवा की सलाह नहीं देता। लक्षण या आपात चिंता हो तो डॉक्टर, अस्पताल या आपातकालीन सेवा को कॉल करें।',
  },
} as const;

export async function requestAssistantPlan(input: {
  message: string;
  services: Service[];
  lang: AssistantLang;
  imageAttachments?: AssistantAttachment[];
  token?: string | null;
  context?: AssistantPlanContext | null;
}): Promise<AssistantPlan> {
  const message = input.message.trim();
  const compactServices = input.services.map(compactService).slice(0, 60);
  const imageAttachments = (input.imageAttachments ?? []).slice(0, 3).map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    uri: attachment.uri,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
  }));

  try {
    return await backendRequest<AssistantPlan>('/api/assistant/plan', {
      method: 'POST',
      token: input.token ?? undefined,
      body: {
        message,
        lang: input.lang,
        services: compactServices,
        imageAttachments,
        context: input.context ?? null,
      },
    });
  } catch {
    return buildLocalAssistantPlan(message, input.services, input.lang, input.context ?? null);
  }
}

export function buildLocalAssistantPlan(
  message: string,
  services: Service[],
  lang: AssistantLang = 'en',
  context: AssistantPlanContext | null = null,
): AssistantPlan {
  const copy = COPY[lang] ?? COPY.en;
  const normalized = message.toLowerCase();
  const urgent = URGENT_WORDS.some((word) => normalized.includes(word));
  const route = urgent ? null : extractRouteTimeRequest(message, services);
  if (route) {
    return buildRouteTimePlan(route);
  }
  const intent = detectIntent(normalized, urgent);
  const category = categoryForIntent(intent, urgent, normalized);
  const when = extractWhen(message);
  const suggestedServices = rankServices(services, category, normalized).slice(0, 3);
  const primary = suggestedServices[0] ?? null;
  const needsDetails = intent === 'medical_appointment' && !when && !urgent;
  const wantsCalendarScreen = matchesAny(normalized, CALENDAR_SCREEN_WORDS);
  const wantsConnectorScreen = matchesAny(normalized, CONNECTOR_SCREEN_WORDS);

  const actions: AssistantAction[] = [];
  if (primary?.phone) {
    actions.push({ kind: 'call', label: copy.call(primary.name), value: primary.phone, serviceId: primary.id });
  }
  if (primary?.map_url) {
    actions.push({ kind: 'directions', label: copy.directions, value: primary.map_url, serviceId: primary.id });
  }
  if (primary?.source_url) {
    actions.push({ kind: 'source', label: copy.source, value: primary.source_url, serviceId: primary.id });
  }
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
  if (wantsCalendarScreen) {
    actions.push({ kind: 'open_screen', label: copy.openScreen('calendar'), value: JSON.stringify({ screen: 'calendar' }), serviceId: null });
  }
  if (wantsConnectorScreen) {
    actions.push({ kind: 'open_screen', label: copy.openScreen('connectors'), value: JSON.stringify({ screen: 'connectors' }), serviceId: null });
  }
  actions.push({ kind: needsDetails ? 'details' : 'family_update', label: needsDetails ? copy.details : copy.family });

  const baseSummary = urgent
    ? copy.urgentSummary
    : primary
      ? when && intent === 'medical_appointment'
        ? copy.readyMedical(primary.name, when)
        : copy.foundService(primary.name)
      : copy.noService;
  const upcoming = !urgent && wantsCalendarScreen ? upcomingCalendarEntry(context) : null;
  const summaryParts: string[] = [];
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
    checklist: intent === 'medical_appointment' ? [...copy.checklistDoctor] : [...copy.checklistGeneral],
    nextSteps: [copy.nextCall, copy.nextShare],
    actions,
  };
}

function detectIntent(normalized: string, urgent: boolean): AssistantIntent {
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

function categoryForIntent(intent: AssistantIntent, urgent: boolean, normalized = ''): ServiceCategory | null {
  if (urgent) return 'hospital';
  if (intent === 'medical_appointment') return 'doctor';
  if (intent === 'medicine_delivery') return 'medical_shop';
  if (intent === 'transport') return 'travel_agent';
  if (intent === 'elder_care') return 'elder_home';
  if (intent === 'daily_help' && matchesAny(normalized, CATEGORY_KEYWORDS.home_service)) return 'home_service';
  if (intent === 'daily_help') return 'daily_service';
  return null;
}

function rankServices(services: Service[], preferred: ServiceCategory | null, normalized: string): Service[] {
  return [...services]
    .map((service) => ({
      service,
      score:
        (preferred && service.category === preferred ? 50 : 0) +
        (service.verified ? 12 : 0) +
        (service.phone ? 8 : 0) +
        (normalized.includes(service.name.toLowerCase().split(' ')[0] ?? '') ? 10 : 0) +
        (service.description ? wordOverlap(normalized, service.description.toLowerCase()) : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.service);
}

function matchesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function wordOverlap(a: string, b: string) {
  return a
    .split(/\W+/)
    .filter((word) => word.length > 3 && b.includes(word)).length;
}

function upcomingCalendarEntry(
  context: AssistantPlanContext | null,
): { title: string; time: string | null; day: 'today' | 'tomorrow' } | null {
  const entries = context?.calendar ?? [];
  if (!entries.length) return null;
  // Calendar dateISO values are LOCAL dates, so the keys must be local too
  // (toISOString would give the UTC date, one day behind before 05:30 IST).
  const todayKey =
    context?.todayISO && /^\d{4}-\d{2}-\d{2}$/.test(context.todayISO)
      ? context.todayISO
      : toLocalISODate(new Date());
  const tomorrowKey = nextDateKey(todayKey);
  for (const entry of entries) {
    const dateKey = String(entry.dateISO || '').slice(0, 10);
    if (dateKey === todayKey) return { title: entry.title, time: entry.time ?? null, day: 'today' };
    if (dateKey === tomorrowKey) return { title: entry.title, time: entry.time ?? null, day: 'tomorrow' };
  }
  return null;
}

function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalISODate(new Date(year, month - 1, day + 1));
}

function extractWhen(message: string) {
  const matches = message.match(
    /\b(today|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/gi,
  );
  return matches?.slice(0, 3).join(' ') ?? '';
}

interface RoutePlace {
  display: string;
  query: string;
  serviceId: string | null;
}

interface RouteRequest {
  origin: RoutePlace;
  destination: RoutePlace;
  estimate: string;
  directionsUrl: string;
}

function buildRouteTimePlan(route: RouteRequest): AssistantPlan {
  const copy = COPY.en;
  return {
    source: 'local',
    intent: 'transport',
    status: 'handoff',
    summary: copy.routeSummary(route.origin.display, route.destination.display, route.estimate),
    followUpQuestion: null,
    safetyNote: copy.routeSafety,
    suggestedServices: [],
    checklist: [...copy.routeChecklist],
    nextSteps: [...copy.routeNextSteps],
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

function extractRouteTimeRequest(message: string, services: Service[]): RouteRequest | null {
  const normalized = message.toLowerCase();
  if (!ROUTE_TIME_WORDS.some((word) => normalized.includes(word))) return null;

  const places = extractRoutePlaces(message);
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

function extractRoutePlaces(message: string) {
  const fromTo = message.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!]|$)/i);
  if (fromTo) return { origin: fromTo[1], destination: fromTo[2] };

  const toFrom = message.match(/\bto\s+(.+?)\s+from\s+(.+?)(?:[?.!]|$)/i);
  if (toFrom) return { origin: toFrom[2], destination: toFrom[1] };

  return null;
}

function cleanRoutePlace(value: string) {
  return value
    .trim()
    .replace(/\s+(?:during|in|with)\s+(?:average\s+)?traffic.*$/i, '')
    .replace(/[,\s.?!;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

function resolveRoutePlace(raw: string, services: Service[]): RoutePlace {
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

function matchKnownPlaceAlias(raw: string, services: Service[]) {
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
  return match ? services.find((service) => service.name === match.serviceName) ?? null : null;
}

function serviceToRoutePlace(service: Service): RoutePlace {
  return {
    display: service.name,
    query: [service.name, service.address].filter(Boolean).join(', '),
    serviceId: service.id,
  };
}

function placeMatchScore(raw: string, serviceName: string) {
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

function estimateRouteTime(origin: RoutePlace, destination: RoutePlace) {
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

function buildDirectionsUrl(origin: string, destination: string) {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function ensureSiliguriQuery(place: string) {
  return /\bsiliguri\b/i.test(place) ? place : `${place}, Siliguri`;
}

function titleRoutePlace(place: string) {
  return place
    .split(' ')
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function tokenizePlace(value: string) {
  return normalizePlace(value)
    .split(' ')
    .filter((word) => word.length > 2);
}

function normalizePlace(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function editDistance(a: string, b: string) {
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

function compactService(service: Service): Service {
  return {
    id: service.id,
    name: service.name,
    category: service.category,
    description: service.description,
    phone: service.phone,
    address: service.address,
    map_url: service.map_url,
    image_url: null,
    hours: service.hours,
    rating: service.rating,
    verified: service.verified,
    town: service.town,
    source_url: service.source_url,
    verification_status: service.verification_status,
    verified_at: service.verified_at,
    phone_confirmed: service.phone_confirmed,
    claim_status: service.claim_status,
    service_area: service.service_area,
    created_at: service.created_at,
    upi_id: service.upi_id ?? null,
    city_id: service.city_id ?? null,
  };
}
