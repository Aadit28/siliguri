import 'expo-sqlite/localStorage/install';

// The words that go to the shop, and the small memory that stops an elder
// retyping them every month.
//
// Kept apart from src/lib/i18n: those strings are what the ELDER reads, chosen
// by the app's language toggle. These are what the SHOPKEEPER reads, chosen per
// message — a Siliguri family may run the app in English and still need the
// kirana messaged in Bengali. One toggle cannot serve both, so the order sheet
// asks each time and remembers the answer per shop.

export type OrderLanguage = 'en' | 'hi' | 'bn';

export const ORDER_LANGUAGES: { code: OrderLanguage; label: string }[] = [
  // Endonyms, not English names: the person choosing is picking the language
  // their shopkeeper reads, and "Bengali" is not what that looks like to them.
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
];

/**
 * Ask, or state. Two real cases and the difference is money:
 *
 *  - 'ask'   — a one-off. Nobody has quoted anything, so the message asks, and
 *              the elder learns the price before any of it is owed.
 *  - 'known' — a standing order. The family already agreed ₹X with this shop
 *              and it does not move month to month; repeating it in the message
 *              is what makes a wrong bill on delivery arguable.
 */
export type OrderPriceMode = 'ask' | 'known';

export type OrderDraft = {
  item: string;
  language: OrderLanguage;
  priceMode: OrderPriceMode;
  /** Paise, like every other amount in this app. Null whenever priceMode is 'ask'. */
  pricePaise: number | null;
};

export type OrderContext = {
  shopName: string;
  /** The person the order is for. Omitted from the message when absent. */
  forName?: string | null;
  /** Where it goes. Omitted when absent — never guessed. */
  address?: string | null;
};

const ATTRIBUTION: Record<OrderLanguage, string> = {
  en: 'Sent via Saathi.',
  hi: 'Saathi से भेजा गया।',
  bn: 'Saathi থেকে পাঠানো।',
};

const TEMPLATES: Record<
  OrderLanguage,
  {
    greeting: (shop: string) => string;
    item: (item: string) => string;
    forLine: (name: string) => string;
    addressLine: (address: string) => string;
    ask: string;
    known: (rupees: string) => string;
  }
> = {
  en: {
    greeting: (shop) => `Hello, ${shop}.`,
    item: (item) => `I would like to order: ${item}`,
    forLine: (name) => `For: ${name}`,
    addressLine: (address) => `Address: ${address}`,
    ask: 'Please tell me the price, and whether you can deliver.',
    known: (rupees) => `Agreed price: ${rupees}. Please send it as usual.`,
  },
  hi: {
    greeting: (shop) => `नमस्ते, ${shop}।`,
    item: (item) => `मुझे यह चाहिए: ${item}`,
    forLine: (name) => `किसके लिए: ${name}`,
    addressLine: (address) => `पता: ${address}`,
    ask: 'कृपया दाम बताएँ, और क्या डिलीवरी हो जाएगी।',
    known: (rupees) => `तय दाम: ${rupees}। हमेशा की तरह भेज दीजिए।`,
  },
  bn: {
    greeting: (shop) => `নমস্কার, ${shop}।`,
    item: (item) => `আমার এটি লাগবে: ${item}`,
    forLine: (name) => `কার জন্য: ${name}`,
    addressLine: (address) => `ঠিকানা: ${address}`,
    ask: 'দয়া করে দাম জানান, আর ডেলিভারি হবে কিনা।',
    known: (rupees) => `ঠিক করা দাম: ${rupees}। আগের মতোই পাঠিয়ে দিন।`,
  },
};

export function rupeeLabel(pricePaise: number | null | undefined) {
  if (pricePaise === null || pricePaise === undefined) return null;
  // Whole rupees. A shopkeeper reading "₹249.50" on WhatsApp is being asked to
  // care about a precision no counter in Siliguri transacts in.
  return `₹${Math.round(pricePaise / 100)}`;
}

/**
 * The exact text the elder will see before they send it. Nothing is hidden from
 * this string and nothing is added after it — the preview in the order sheet is
 * this function's output, and so is the WhatsApp draft.
 */
export function buildOrderMessage(draft: OrderDraft, context: OrderContext): string {
  const t = TEMPLATES[draft.language] ?? TEMPLATES.en;
  const lines = [t.greeting(context.shopName.trim() || 'Namaste'), t.item(draft.item.trim())];

  const name = String(context.forName ?? '').trim();
  if (name) lines.push(t.forLine(name));
  const address = String(context.address ?? '').trim();
  if (address) lines.push(t.addressLine(address));

  const rupees = rupeeLabel(draft.pricePaise);
  // 'known' without a number falls back to asking rather than sending a
  // sentence with a blank where the amount should be.
  lines.push(draft.priceMode === 'known' && rupees ? t.known(rupees) : t.ask);

  lines.push(ATTRIBUTION[draft.language] ?? ATTRIBUTION.en);
  return lines.join('\n');
}

// ----- Remembered drafts -----
//
// Per shop, because that is the unit a standing order belongs to: the same
// pharmacy, the same strips, the same ₹450 every month. Local only — this is a
// convenience, not a record, and it must not become another thing to sync.

const DRAFTS_KEY = 'saathi.orderDrafts.v1';

type StoredDrafts = Record<string, OrderDraft>;

function readDrafts(): StoredDrafts {
  try {
    const raw = globalThis.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredDrafts) : {};
  } catch {
    return {};
  }
}

export function loadOrderDraft(serviceId: string): OrderDraft | null {
  const stored = readDrafts()[serviceId];
  if (!stored || typeof stored.item !== 'string') return null;
  return {
    item: stored.item,
    language: ORDER_LANGUAGES.some((l) => l.code === stored.language) ? stored.language : 'hi',
    priceMode: stored.priceMode === 'known' ? 'known' : 'ask',
    pricePaise: typeof stored.pricePaise === 'number' ? stored.pricePaise : null,
  };
}

// The delivery address is per HOUSEHOLD, not per shop: it is the same door
// whichever kirana is being messaged, and asking for it once per shop would be
// the app making an elder retype their own address.
const ADDRESS_KEY = 'saathi.orderAddress.v1';

export function loadOrderAddress(): string {
  try {
    return globalThis.localStorage.getItem(ADDRESS_KEY) || '';
  } catch {
    return '';
  }
}

export function saveOrderAddress(address: string) {
  try {
    globalThis.localStorage.setItem(ADDRESS_KEY, address.trim());
  } catch {
    // Same trade as saveOrderDraft: convenience may fail, the order may not.
  }
}

export function saveOrderDraft(serviceId: string, draft: OrderDraft) {
  try {
    const all = readDrafts();
    all[serviceId] = draft;
    globalThis.localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
  } catch {
    // A full or unavailable store costs the elder a retype next month. It must
    // never cost them the order they are sending right now.
  }
}
