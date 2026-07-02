import { Linking } from 'react-native';

interface UpiPaymentInput {
  upiId: string;
  name?: string | null;
  amount?: string | null;
  note?: string | null;
}

export function buildUpiUrl(input: UpiPaymentInput): string {
  const params = new URLSearchParams();
  params.set('pa', input.upiId);
  if (input.name) params.set('pn', input.name);
  if (input.amount) params.set('am', input.amount);
  params.set('cu', 'INR');
  if (input.note) params.set('tn', input.note);
  return `upi://pay?${params.toString()}`;
}

export async function openUpiPayment(input: UpiPaymentInput): Promise<boolean> {
  try {
    await Linking.openURL(buildUpiUrl(input));
    return true;
  } catch {
    return false;
  }
}
