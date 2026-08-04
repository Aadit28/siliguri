import type {
  Activity,
  ActivityCategory,
  ActivityMobilityLevel,
  ActivitySession,
} from '../lib/types';
import type { Lang } from '../lib/languages';
import { todayISO } from '../lib/notifications';

export type { ActivityCategory } from '../lib/types';
export type PreviewActivity = Activity;

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'yoga',
  'fitness',
  'learning',
  'creative',
  'social',
  'wellness',
];

type PreviewHindiCopy = { title: string; description: string };

const PREVIEW_HINDI_COPY: Record<string, PreviewHindiCopy> = {
  'gentle-chair-yoga': {
    title: 'हल्का चेयर योग',
    description: 'बैठकर किए जा सकने वाले शांत साँस, खिंचाव और संतुलन के अभ्यास।',
  },
  'restorative-yoga': {
    title: 'आरामदायक योग',
    description: 'आराम, लचीलेपन और शांति के लिए सहारे के साथ धीमे आसन।',
  },
  'pranayama-breathing': {
    title: 'प्राणायाम और श्वास',
    description: 'शुरुआती लोगों के लिए बैठकर सहज गति से साँस के अभ्यास।',
  },
  'balance-yoga-basics': {
    title: 'संतुलन योग की बुनियाद',
    description: 'स्थिरता और रोज़मर्रा के आत्मविश्वास के लिए सहारे के साथ खड़े व बैठे आसन।',
  },
  'morning-yoga-stretch': {
    title: 'सुबह योग और स्ट्रेच',
    description: 'जोड़ों के अनुकूल खिंचाव और निर्देशित विश्राम के साथ दिन की हल्की शुरुआत।',
  },
  'steady-steps-mobility': {
    title: 'स्थिर कदम और गतिशीलता',
    description: 'सुरक्षित चलने और खड़े होने के लिए सहारे वाले ताकत व संतुलन अभ्यास।',
  },
  'chair-strength-circle': {
    title: 'चेयर स्ट्रेंथ मंडली',
    description: 'हाथ, पैर और रोज़मर्रा की गतिविधि के लिए बैठकर किए जाने वाले आसान अभ्यास।',
  },
  'supported-walking-club': {
    title: 'सहारे वाला वॉकिंग क्लब',
    description: 'वार्म-अप और विश्राम के साथ छोटी दूरी की दोस्ताना इनडोर सैर।',
  },
  'fall-prevention-balance': {
    title: 'गिरने से बचाव और संतुलन',
    description: 'रोज़मर्रा के आत्मविश्वास के लिए संतुलन, मुड़ने और बैठकर उठने का अभ्यास।',
  },
  'gentle-dance-movement': {
    title: 'हल्का नृत्य और गतिविधि',
    description: 'परिचित संगीत पर आसान तालबद्ध गतिविधियाँ, बैठकर और खड़े होकर करने के विकल्पों के साथ।',
  },
  'smartphone-confidence': {
    title: 'स्मार्टफ़ोन आत्मविश्वास',
    description: 'सहज गति से WhatsApp, वीडियो कॉल, फोटो भेजना और उपयोगी फ़ोन सेटिंग्स सीखें।',
  },
  'online-scam-safety': {
    title: 'ऑनलाइन ठगी से बचाव',
    description: 'संदिग्ध कॉल, लिंक, संदेश और निजी जानकारी माँगने वालों को पहचानने का अभ्यास।',
  },
  'digital-payments-basics': {
    title: 'डिजिटल भुगतान की बुनियाद',
    description: 'UPI, भुगतान की जाँच और सुरक्षित लेन-देन की आदतों का सावधानीपूर्ण परिचय।',
  },
  'english-conversation-circle': {
    title: 'अंग्रेज़ी बातचीत मंडली',
    description: 'छोटी बातचीत और परिचित विषयों से रोज़मर्रा की अंग्रेज़ी का दोस्ताना अभ्यास।',
  },
  'memory-games-puzzles': {
    title: 'याददाश्त खेल और पहेलियाँ',
    description: 'आनंद और बातचीत के लिए सहज शब्द, चित्र और संख्या के खेल।',
  },
  'watercolour-afternoon': {
    title: 'वॉटरकलर दोपहर',
    description: 'बिल्कुल शुरुआती लोगों के लिए चरण-दर-चरण मार्गदर्शन वाला सहज कला सत्र।',
  },
  'knitting-crochet-circle': {
    title: 'बुनाई और क्रोशिया मंडली',
    description: 'अपना काम लाएँ या सहयोगी समूह में आसान टाँके सीखें।',
  },
  'clay-craft-workshop': {
    title: 'मिट्टी और हस्तकला कार्यशाला',
    description: 'नरम मिट्टी और आसानी से पकड़े जाने वाले औज़ारों से सरल सजावटी चीज़ें बनाएँ।',
  },
  'beginner-photography': {
    title: 'शुरुआती फ़ोन फोटोग्राफ़ी',
    description: 'अपने फ़ोन से फोटो का फ़्रेम, रोशनी और व्यवस्था करने के सरल तरीके सीखें।',
  },
  'story-writing-circle': {
    title: 'कहानी लेखन मंडली',
    description: 'यादें साझा करें और ज़रूरत पर लेखन सहायता के साथ उन्हें छोटी कहानियों में बदलें।',
  },
  'songs-stories-circle': {
    title: 'गीत और किस्से मंडली',
    description: 'परिचित गीत गाएँ, यादें साझा करें और दोस्ताना साप्ताहिक मिलन में पड़ोसियों से मिलें।',
  },
  'community-tea-meetup': {
    title: 'सामुदायिक चाय मिलन',
    description: 'पड़ोसियों से मिलने और सहज बातचीत के लिए आराम से बिताई जाने वाली दोपहर।',
  },
  'board-games-afternoon': {
    title: 'बोर्ड गेम्स दोपहर',
    description: 'नियम समझाने के लिए मददगारों के साथ परिचित ताश और बोर्ड गेम खेलें।',
  },
  'neighbourhood-book-club': {
    title: 'पड़ोस पुस्तक क्लब',
    description: 'ऑडियो और बड़े अक्षरों के विकल्पों के साथ छोटी कहानियों और कविताओं पर चर्चा।',
  },
  'intergenerational-conversation': {
    title: 'पीढ़ियों की बातचीत',
    description: 'संचालित मिलन जहाँ बुज़ुर्ग और युवा पड़ोसी कौशल व किस्से साझा करते हैं।',
  },
  'calm-morning-mindfulness': {
    title: 'शांत सुबह माइंडफुलनेस',
    description: 'शांत, स्वागतपूर्ण समूह में निर्देशित साँस और आसान विश्राम अभ्यास।',
  },
  'laughter-wellness-circle': {
    title: 'हँसी और स्वास्थ्य मंडली',
    description: 'बिना कठिन गतिविधि के हल्की साँस, मज़ेदार भाव और सामूहिक हँसी।',
  },
  'healthy-cooking-talk': {
    title: 'स्वस्थ खाना बातचीत',
    description: 'सरल रोज़मर्रा के भोजन, पानी और संतुलित मात्रा पर व्यावहारिक चर्चा।',
  },
  'sleep-relaxation-workshop': {
    title: 'नींद और विश्राम कार्यशाला',
    description: 'आरामदायक शाम के लिए शांत दिनचर्या, सहज साँस और मददगार आदतों पर चर्चा।',
  },
  'healthy-ageing-discussion': {
    title: 'स्वस्थ उम्र बढ़ने पर चर्चा',
    description: 'दिनचर्या, मेलजोल और देखभाल टीम से पूछने वाले सवालों पर निर्देशित बातचीत।',
  },
};

const TIMEZONE = 'Asia/Kolkata';
const PREVIEW_CITY_ID = 'local-siliguri';

type PreviewSeed = {
  category: ActivityCategory;
  slug: string;
  title: string;
  description: string;
  day: number;
  start: string;
  end: string;
  mobility?: ActivityMobilityLevel;
  featured?: boolean;
};

function nextWeekdayDate(targetDay: number) {
  const [year, month, day] = todayISO().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysAhead = ((targetDay - date.getUTCDay() + 6) % 7) + 1;
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function previewSession(seed: PreviewSeed, activityId: string): ActivitySession {
  const date = nextWeekdayDate(seed.day);
  return {
    id: `${activityId}-next`,
    activityId,
    startsAt: `${date}T${seed.start}:00+05:30`,
    endsAt: `${date}T${seed.end}:00+05:30`,
    timezone: TIMEZONE,
    status: 'scheduled',
    capacity: null,
    spotsRemaining: null,
  };
}

function previewActivity(seed: PreviewSeed): Activity {
  const id = `preview-${seed.slug}`;
  return {
    catalogSource: 'preview',
    id,
    cityId: PREVIEW_CITY_ID,
    slug: seed.slug,
    title: seed.title,
    description: seed.description,
    category: seed.category,
    // These are product-review concepts, not claims about a real provider.
    instructorName: null,
    venueName: 'Preview community venue',
    address: 'Preview location, Siliguri',
    town: 'Siliguri',
    languages: ['Hindi', 'Bengali'],
    mobilityLevel: seed.mobility ?? 'seated',
    wheelchairAccessible: true,
    chairAvailable: true,
    caregiverWelcome: true,
    accessibilityNotes: 'Preview accessibility details; confirm them before any live listing is published.',
    imageUrl: null,
    costPaise: 0,
    currency: 'INR',
    contactPhone: null,
    verificationStatus: 'unverified',
    verifiedAt: null,
    verifiedBy: null,
    registrationOpen: false,
    featured: seed.featured ?? false,
    capacity: null,
    waitlistCapacity: 0,
    waitlistSpotsRemaining: 0,
    sessions: [previewSession(seed, id)],
    enrollment: null,
  };
}

const PREVIEW_SEEDS: PreviewSeed[] = [
  // Yoga
  {
    category: 'yoga',
    slug: 'gentle-chair-yoga',
    title: 'Gentle chair yoga',
    description: 'Calm breathing, stretching and balance practice with every movement available while seated.',
    day: 2,
    start: '09:30',
    end: '10:20',
    featured: true,
  },
  {
    category: 'yoga',
    slug: 'restorative-yoga',
    title: 'Restorative yoga',
    description: 'Slow supported poses that encourage comfort, flexibility and relaxation.',
    day: 4,
    start: '10:00',
    end: '10:50',
    mobility: 'gentle',
  },
  {
    category: 'yoga',
    slug: 'pranayama-breathing',
    title: 'Pranayama & breathing',
    description: 'Beginner-friendly breathing exercises taught at a comfortable, seated pace.',
    day: 1,
    start: '08:30',
    end: '09:10',
  },
  {
    category: 'yoga',
    slug: 'balance-yoga-basics',
    title: 'Balance yoga basics',
    description: 'Supported standing and seated yoga focused on steadiness and everyday confidence.',
    day: 5,
    start: '09:00',
    end: '09:50',
    mobility: 'gentle',
  },
  {
    category: 'yoga',
    slug: 'morning-yoga-stretch',
    title: 'Morning yoga stretch',
    description: 'A gentle start to the day with joint-friendly stretches and guided relaxation.',
    day: 6,
    start: '08:00',
    end: '08:45',
    mobility: 'gentle',
  },

  // Movement and fitness
  {
    category: 'fitness',
    slug: 'steady-steps-mobility',
    title: 'Steady steps & mobility',
    description: 'Supported strength and balance exercises for safer walking and standing.',
    day: 1,
    start: '10:30',
    end: '11:15',
    mobility: 'gentle',
    featured: true,
  },
  {
    category: 'fitness',
    slug: 'chair-strength-circle',
    title: 'Chair strength circle',
    description: 'Simple seated strength exercises for arms, legs and daily movement.',
    day: 3,
    start: '11:00',
    end: '11:45',
  },
  {
    category: 'fitness',
    slug: 'supported-walking-club',
    title: 'Supported walking club',
    description: 'A sociable, short-distance indoor walk with warm-up and rest stops.',
    day: 4,
    start: '07:30',
    end: '08:15',
    mobility: 'moderate',
  },
  {
    category: 'fitness',
    slug: 'fall-prevention-balance',
    title: 'Fall-prevention balance',
    description: 'Practical balance, turning and sit-to-stand practice for everyday confidence.',
    day: 5,
    start: '11:00',
    end: '11:50',
    mobility: 'gentle',
  },
  {
    category: 'fitness',
    slug: 'gentle-dance-movement',
    title: 'Gentle dance movement',
    description: 'Easy rhythmic movements to familiar music, with seated and standing options.',
    day: 0,
    start: '10:30',
    end: '11:20',
    mobility: 'gentle',
  },

  // Learning
  {
    category: 'learning',
    slug: 'smartphone-confidence',
    title: 'Smartphone confidence',
    description: 'Learn WhatsApp, video calls, photo sharing and useful phone settings at an easy pace.',
    day: 6,
    start: '11:00',
    end: '12:15',
    featured: true,
  },
  {
    category: 'learning',
    slug: 'online-scam-safety',
    title: 'Online scam safety',
    description: 'Practise spotting suspicious calls, links, messages and requests for personal information.',
    day: 2,
    start: '15:00',
    end: '16:00',
  },
  {
    category: 'learning',
    slug: 'digital-payments-basics',
    title: 'Digital payments basics',
    description: 'A careful introduction to UPI, payment checks and safe transaction habits.',
    day: 4,
    start: '14:30',
    end: '15:30',
  },
  {
    category: 'learning',
    slug: 'english-conversation-circle',
    title: 'English conversation circle',
    description: 'Friendly everyday English practice through short conversations and familiar topics.',
    day: 5,
    start: '15:30',
    end: '16:30',
  },
  {
    category: 'learning',
    slug: 'memory-games-puzzles',
    title: 'Memory games & puzzles',
    description: 'Relaxed word, picture and number games designed for enjoyment and conversation.',
    day: 0,
    start: '14:00',
    end: '15:00',
  },

  // Creative
  {
    category: 'creative',
    slug: 'watercolour-afternoon',
    title: 'Watercolour afternoon',
    description: 'A relaxed art session for complete beginners with step-by-step guidance.',
    day: 3,
    start: '15:30',
    end: '17:00',
    featured: true,
  },
  {
    category: 'creative',
    slug: 'knitting-crochet-circle',
    title: 'Knitting & crochet circle',
    description: 'Bring a current project or learn simple stitches in a supportive social group.',
    day: 1,
    start: '15:00',
    end: '16:30',
  },
  {
    category: 'creative',
    slug: 'clay-craft-workshop',
    title: 'Clay & craft workshop',
    description: 'Make simple decorative pieces with soft clay and easy-to-handle tools.',
    day: 5,
    start: '14:30',
    end: '16:00',
  },
  {
    category: 'creative',
    slug: 'beginner-photography',
    title: 'Beginner phone photography',
    description: 'Learn simple ways to frame, light and organise photos using your own phone.',
    day: 6,
    start: '14:00',
    end: '15:15',
  },
  {
    category: 'creative',
    slug: 'story-writing-circle',
    title: 'Story writing circle',
    description: 'Share memories and turn them into short stories with optional writing support.',
    day: 2,
    start: '16:00',
    end: '17:15',
  },

  // Social
  {
    category: 'social',
    slug: 'songs-stories-circle',
    title: 'Songs & stories circle',
    description: 'Sing familiar songs, share memories and meet neighbours in a friendly weekly gathering.',
    day: 0,
    start: '16:00',
    end: '17:15',
    featured: true,
  },
  {
    category: 'social',
    slug: 'community-tea-meetup',
    title: 'Community tea meetup',
    description: 'An unhurried afternoon to meet neighbours and enjoy guided conversation.',
    day: 3,
    start: '16:00',
    end: '17:00',
  },
  {
    category: 'social',
    slug: 'board-games-afternoon',
    title: 'Board games afternoon',
    description: 'Play familiar card and board games with helpers available to explain the rules.',
    day: 6,
    start: '16:00',
    end: '17:30',
  },
  {
    category: 'social',
    slug: 'neighbourhood-book-club',
    title: 'Neighbourhood book club',
    description: 'Discuss short stories and poems with audio and large-print options.',
    day: 4,
    start: '16:00',
    end: '17:00',
  },
  {
    category: 'social',
    slug: 'intergenerational-conversation',
    title: 'Intergenerational conversation',
    description: 'A moderated meetup where older and younger neighbours exchange skills and stories.',
    day: 0,
    start: '11:30',
    end: '12:45',
  },

  // Wellness
  {
    category: 'wellness',
    slug: 'calm-morning-mindfulness',
    title: 'Calm morning mindfulness',
    description: 'Guided breathing and simple relaxation practices in a quiet, welcoming group.',
    day: 5,
    start: '08:30',
    end: '09:15',
    featured: true,
  },
  {
    category: 'wellness',
    slug: 'laughter-wellness-circle',
    title: 'Laughter wellness circle',
    description: 'Light breathing, playful expressions and shared laughter without strenuous movement.',
    day: 2,
    start: '11:00',
    end: '11:45',
  },
  {
    category: 'wellness',
    slug: 'healthy-cooking-talk',
    title: 'Healthy cooking talk',
    description: 'Practical discussion of simple everyday meals, hydration and balanced portions.',
    day: 3,
    start: '11:30',
    end: '12:30',
  },
  {
    category: 'wellness',
    slug: 'sleep-relaxation-workshop',
    title: 'Sleep & relaxation workshop',
    description: 'Explore calming routines, comfortable breathing and habits that support restful evenings.',
    day: 4,
    start: '15:00',
    end: '16:00',
  },
  {
    category: 'wellness',
    slug: 'healthy-ageing-discussion',
    title: 'Healthy ageing discussion',
    description: 'A guided conversation about routines, connection and questions for a care team.',
    day: 6,
    start: '10:00',
    end: '11:00',
  },
];

export const PREVIEW_ACTIVITIES: Activity[] = PREVIEW_SEEDS.map(previewActivity);

// Kept as an alias for screens ported from the earlier checkout.
export const MOCK_ACTIVITIES: PreviewActivity[] = PREVIEW_ACTIVITIES;

export function localizeActivity(
  activity: PreviewActivity,
  lang: Lang,
  field: 'title' | 'description',
) {
  if (lang === 'hi') {
    const copy = PREVIEW_HINDI_COPY[activity.slug];
    if (copy) return copy[field];
  }
  return field === 'title' ? activity.title : activity.description ?? '';
}
