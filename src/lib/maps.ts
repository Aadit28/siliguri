import * as Linking from 'expo-linking';
import { Service } from './types';

// Google Maps deep links, built from the only geography this app actually has:
// an address string.
//
// There are no coordinates anywhere — not on services, not in any migration,
// not on the user. So every link here is a QUERY link: Google resolves the
// address on its own side and drops the pin. That is a deliberate trade. A real
// in-app map would need 149 listings geocoded and a home location stored for
// the elder, and would then be wrong for every listing whose address Google
// would have resolved better.
//
// Links use the documented Maps URLs API (`?api=1`), which is the only form
// Google promises to keep working, and which resolves correctly on Android, on
// iOS (handing off to the Google Maps app when installed, Apple Maps or the
// browser when not) and on the web.

const SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';
const DIRECTIONS_BASE = 'https://www.google.com/maps/dir/?api=1&destination=';

/**
 * What Google should look for: the shop's name AND its address.
 *
 * The name alone finds the wrong branch of a chain pharmacy; the address alone
 * lands on a building without saying which unit inside it. Together they are
 * what a person would type.
 */
function destinationQuery(service: Pick<Service, 'name' | 'address'>): string | null {
  const parts = [service.name, service.address]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return encodeURIComponent(parts.join(', '));
}

/**
 * Show it on a map, pin only, no route. What an elder wants when the question
 * is "where is this, roughly?" rather than "take me there now".
 */
export function mapsSearchUrl(service: Pick<Service, 'name' | 'address'>): string | null {
  const query = destinationQuery(service);
  return query ? SEARCH_BASE + query : null;
}

/**
 * Route to it. Prefers the curated map_url the directory already carries — a
 * human checked those against the real place — and falls back to a built query
 * link for the 45 of 149 listings that have no map_url but do have an address.
 * Before this fallback those listings showed no Directions button at all.
 */
export function mapsDirectionsUrl(
  service: Pick<Service, 'name' | 'address' | 'map_url'>,
): string | null {
  const curated = String(service.map_url ?? '').trim();
  if (curated) return curated;
  const query = destinationQuery(service);
  return query ? DIRECTIONS_BASE + query : null;
}

/**
 * Every place of one kind, near one town, on one map.
 *
 * This deliberately searches GOOGLE's places, not Saathi's 56 listings. Google
 * Maps URLs cannot carry more than one pin, so the honest options were a single
 * pin (useless for "show me everything") or a category search that Google fills
 * in. The screen must say which of those it is doing — see services.mapAllNote —
 * because a map of Google's pharmacies presented as Saathi's verified ones would
 * be the directory claiming coverage it never audited.
 */
export function mapsCategorySearchUrl(categoryLabel: string, cityLabel: string): string | null {
  const parts = [categoryLabel, cityLabel].map((part) => String(part ?? '').trim()).filter(Boolean);
  if (!parts.length) return null;
  return SEARCH_BASE + encodeURIComponent(parts.join(' near '));
}

/**
 * Open a maps URL, swallowing the failure the same way every other outbound
 * link on this app does. Returns whether it opened, so a caller that wants to
 * tell the user something can.
 */
export async function openMapsUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
