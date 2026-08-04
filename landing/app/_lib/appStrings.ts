import type { Lang } from "./copy";

/**
 * Strings for the in-page app mock-ups, lifted from the product's own
 * src/locales/{en,hi}.json rather than reinvented here — the mock-up is meant to
 * be the app, so its labels have to be the app's labels.
 *
 * The app ships Hindi and English only. A visitor reading the landing page in
 * Marathi therefore sees the mock-up in Hindi, which is what they would actually
 * get on their phone. Showing invented Marathi chrome would be a nicer picture
 * of a product that does not exist yet.
 */
export type AppStrings = {
  brand: string;
  signIn: string;
  tabs: { home: string; services: string; assistant: string; ask: string; sos: string };
  services: { title: string; search: string; verified: string };
  assistant: { title: string; online: string; newChat: string; saved: string };
  reminder: { title: string; what: string; when: string; repeats: string; daily: string; time: string; medicine: string };
  today: { title: string; done: string; due: string; walk: string; call: string; morning: string; evening: string };
  guardian: { title: string; forWhom: string; note: string };
  ask: { title: string; inReview: string; reviewNote: string; postTitle: string; postBody: string; author: string };
};

const en: AppStrings = {
  brand: "Saathi",
  signIn: "Sign in",
  tabs: { home: "Home", services: "Services", assistant: "Assistant", ask: "Ask", sos: "SOS" },
  services: {
    title: "Services",
    search: "Search Saathi's listed services…",
    verified: "Verified",
  },
  assistant: {
    title: "Assistant",
    online: "Online now",
    newChat: "New chat",
    saved: "Saved · rings at 8:00 PM",
  },
  reminder: {
    title: "New reminder",
    what: "What",
    when: "When",
    repeats: "Repeats",
    daily: "Every day",
    time: "8:00 PM",
    medicine: "BP medicine",
  },
  today: {
    title: "Today",
    done: "Done",
    due: "8:00 PM",
    walk: "Morning walk",
    call: "Call Priya",
    morning: "7:00 AM",
    evening: "9:00 PM",
  },
  guardian: {
    title: "Set a reminder",
    forWhom: "For Ma",
    note: "Ma confirms this on her own phone.",
  },
  ask: {
    title: "Ask",
    inReview: "In review",
    reviewNote: "Questions are reviewed before they appear publicly.",
    postTitle: "Reliable physiotherapist for my father?",
    postBody: "My father had a knee operation. Looking for someone who can visit at home…",
    author: "Priya · London",
  },
};

const hi: AppStrings = {
  brand: "साथी",
  signIn: "साइन इन",
  tabs: { home: "होम", services: "सेवाएँ", assistant: "सहायक", ask: "पूछें", sos: "SOS" },
  services: {
    title: "सेवाएँ",
    search: "साथी में सूचीबद्ध सेवाएँ खोजें…",
    verified: "सत्यापित",
  },
  assistant: {
    title: "सहायक",
    online: "अभी ऑनलाइन",
    newChat: "नई बातचीत",
    saved: "सेव हुआ · रात 8:00 बजे बजेगा",
  },
  reminder: {
    title: "नया रिमाइंडर",
    what: "क्या",
    when: "कब",
    repeats: "दोहराव",
    daily: "हर दिन",
    time: "रात 8:00",
    medicine: "बीपी की दवा",
  },
  today: {
    title: "आज",
    done: "हो गया",
    due: "रात 8:00",
    walk: "सुबह की सैर",
    call: "प्रिया को फ़ोन",
    morning: "सुबह 7:00",
    evening: "रात 9:00",
  },
  guardian: {
    title: "रिमाइंडर लगाएँ",
    forWhom: "माँ के लिए",
    note: "माँ अपने फ़ोन पर इसकी पुष्टि करेंगी।",
  },
  ask: {
    title: "पूछें",
    inReview: "समीक्षा में",
    reviewNote: "सवाल सार्वजनिक होने से पहले जाँचे जाते हैं।",
    postTitle: "पिताजी के लिए भरोसेमंद फ़िज़ियोथेरेपिस्ट?",
    postBody: "पिताजी के घुटने का ऑपरेशन हुआ है। कोई जो घर आकर देख सके…",
    author: "प्रिया · लंदन",
  },
};

export function appStrings(lang: Lang): AppStrings {
  return lang === "en" ? en : hi;
}

/** Whether the mock-up chrome is rendering in Devanagari. */
export const mockIsDeva = (lang: Lang) => lang !== "en";

/**
 * Real entries from the Siliguri dataset the app bundles
 * (src/data/services.json). Institutions rather than individually named
 * doctors: a marketing page does not need a real person's name on it.
 */
export const SAMPLE_LISTINGS = [
  { name: "Siliguri Bhawna Society", area: "Pradhan Nagar", tone: "sage", icon: "elder" },
  { name: "North Bengal Medical College", area: "Siliguri", tone: "peach", icon: "hospital" },
  { name: "Apollo Pharmacy, Netaji More", area: "Siliguri", tone: "lilac", icon: "pharmacy" },
  { name: "Hope Wellness Retreat", area: "Greater Siliguri", tone: "sky", icon: "elder" },
  { name: "Siliguri Municipal Control Room", area: "Siliguri", tone: "butter", icon: "civic" },
] as const;
