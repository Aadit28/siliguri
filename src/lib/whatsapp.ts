import * as Linking from 'expo-linking';

const INDIA_COUNTRY_CODE = '91';

export function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;

  const intl = digits.length === 10 ? `${INDIA_COUNTRY_CODE}${digits}` : digits;
  return intl.length >= 10 && intl.length <= 15 ? intl : null;
}

export function canUseWhatsApp(phone?: string | null) {
  return normalizeWhatsAppPhone(phone) !== null;
}

export function whatsappChatUrl(phone?: string | null) {
  const intl = normalizeWhatsAppPhone(phone);
  return intl ? `https://wa.me/${intl}` : null;
}

export function whatsappCallUrl(phone?: string | null) {
  const intl = normalizeWhatsAppPhone(phone);
  return intl ? `whatsapp://call?phone=${intl}` : null;
}

export function whatsappCallWebUrl(phone?: string | null) {
  const intl = normalizeWhatsAppPhone(phone);
  return intl ? `https://wa.me/call/${intl}` : null;
}

async function openExternalUrl(url: string) {
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return true;

    const link = window.document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }

  await Linking.openURL(url);
  return true;
}

export async function openWhatsAppChat(phone?: string | null) {
  const url = whatsappChatUrl(phone);
  if (!url) return false;

  return openExternalUrl(url);
}

export async function openWhatsAppCall(phone?: string | null) {
  if (process.env.EXPO_OS === 'web') {
    return openWhatsAppChat(phone);
  }

  const appUrl = whatsappCallUrl(phone);
  if (!appUrl) return false;

  try {
    await Linking.openURL(appUrl);
    return true;
  } catch {
    const webUrl = whatsappCallWebUrl(phone);
    if (!webUrl) return false;
    return openExternalUrl(webUrl);
  }
}
