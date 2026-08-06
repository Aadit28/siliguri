import { backendRequest } from './backend';

// Typed wrappers over the /api/consent/* endpoints. Same shape as
// src/lib/bookings.ts: every call throws with the server's { error } sentence
// and the HTTP status backendRequest attaches, and screens turn that into
// elder-readable copy through friendlyConsentError.

/**
 * The version of the consent notice this build shows.
 *
 * The server stores whatever string it is handed and never interprets it, so
 * this constant is the only thing that makes an old grant stop counting as an
 * answer to the current wording. Moving the copy under `consent.purposes.*` in
 * the locale files without bumping this leaves people recorded as having agreed
 * to text they were never shown.
 */
export const CONSENT_VERSION = 'v1';

// Mirrors PURPOSES in server/consent/get.js. Also the display order: the two
// purposes the app cannot run without come first, marketing last.
export const CONSENT_PURPOSES = [
  'care_coordination',
  'health_reminders',
  'guardian_sharing',
  'marketing',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * The purposes the core product runs on. They are still listed, still shown as
 * withdrawable, and the server accepts a withdrawal for them like any other —
 * DPDP gives the right to withdraw a consent as easily as it was given, so a
 * screen that greys these out would be non-compliant. What the screen owes the
 * reader instead is the consequence, spelled out before they confirm.
 */
export const CORE_CONSENT_PURPOSES: ConsentPurpose[] = ['care_coordination', 'health_reminders'];

export function isCoreConsentPurpose(purpose: ConsentPurpose) {
  return CORE_CONSENT_PURPOSES.includes(purpose);
}

export type Consent = {
  purpose: ConsentPurpose;
  granted: boolean;
  version: string | null;
  updatedAt: string | null;
};

export type ConsentState = Record<ConsentPurpose, Consent>;

function blankConsent(purpose: ConsentPurpose): Consent {
  return { purpose, granted: false, version: null, updatedAt: null };
}

/**
 * Every purpose present exactly once, so a screen can index straight into it.
 * A purpose the server never sent back is "never answered", which is the same
 * thing as not granted — silence is not consent.
 */
export function toConsentState(rows: Consent[]): ConsentState {
  const state = {} as ConsentState;
  for (const purpose of CONSENT_PURPOSES) state[purpose] = blankConsent(purpose);
  for (const row of rows) {
    if (row && CONSENT_PURPOSES.includes(row.purpose)) state[row.purpose] = row;
  }
  return state;
}

/**
 * True when the stored answer was given against an older notice. Re-asking is
 * the caller's decision; this only reports the mismatch.
 */
export function isStaleConsent(consent: Consent) {
  return consent.granted && consent.version !== null && consent.version !== CONSENT_VERSION;
}

// ----- Endpoints -----

export async function getConsents(token: string): Promise<Consent[]> {
  const response = await backendRequest<{ consents: Consent[] }>('/api/consent/get', { token });
  return Array.isArray(response.consents) ? response.consents : [];
}

export async function getConsentState(token: string): Promise<ConsentState> {
  return toConsentState(await getConsents(token));
}

export async function setConsent(
  token: string,
  input: { purpose: ConsentPurpose; granted: boolean; version?: string },
): Promise<Consent> {
  const response = await backendRequest<{ consent: Consent }>('/api/consent/set', {
    method: 'POST',
    token,
    body: {
      purpose: input.purpose,
      // Strictly a boolean: the server rejects anything else rather than
      // guessing, and the string "false" would otherwise record a grant the
      // person just withdrew.
      granted: input.granted === true,
      version: input.version ?? CONSENT_VERSION,
    },
  });
  if (!response.consent) throw new Error('The change was not recorded by the server.');
  return response.consent;
}

// ----- Error copy -----

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Turns a rejected consent call into a sentence an elder can act on. Raw server
 * text is English-only and must never reach a Hindi screen. backendRequest
 * attaches the HTTP status; a failure with no status never reached the server,
 * which for this screen means the answer was NOT recorded.
 */
export function friendlyConsentError(e: unknown, t: Translate): string {
  const error = e as Error & { status?: number };
  const status = error?.status;
  const message = error?.message ?? '';

  if (status === undefined) return t('consent.errorNetwork');
  if (status === 401) return t('consent.errorSignIn');
  if (status === 429) return t('consent.errorTooMany');
  // A purpose or version the server refused. Nothing the reader can fix by
  // tapping again, so it reads as a fault on our side rather than theirs.
  if (status === 400) return t('consent.errorGeneric');
  if (status >= 500) return t('consent.errorGeneric');
  return message && message.length <= 120 ? message : t('consent.errorGeneric');
}
