/**
 * Official government and public services an older adult in India may need.
 *
 * These are trust anchors, not competitors: Saathi points at them rather than
 * trying to replace them. They live on the SOS screen because that is where
 * someone goes when they need help from an institution rather than from a
 * neighbour — the home screen buried them under the everyday listings.
 */

export interface TrustRail {
  label: string;
  url: string;
  en: string;
  hi: string;
}

export const TRUST_RAILS: TrustRail[] = [
  {
    label: 'Elderline 14567',
    url: 'https://scw.dosje.gov.in/elderline',
    en: 'Help and information for older adults.',
    hi: 'वरिष्ठ नागरिकों के लिए सहायता और जानकारी।',
  },
  {
    label: 'eSanjeevani',
    url: 'https://esanjeevani.mohfw.gov.in/',
    en: 'Online government health services.',
    hi: 'सरकारी ऑनलाइन स्वास्थ्य सेवाएँ।',
  },
  {
    label: 'UMANG',
    url: 'https://web.umang.gov.in/',
    en: 'Many government services in one place.',
    hi: 'कई सरकारी सेवाएँ एक ही जगह।',
  },
  {
    label: 'CSC access',
    url: 'https://csc.gov.in/',
    en: 'Assisted access to digital services.',
    hi: 'डिजिटल सेवाओं तक सहायता के साथ पहुँच।',
  },
  {
    label: 'Yatri Sathi',
    url: 'https://yatrisathi.in/',
    en: 'Travel information and support.',
    hi: 'यात्रा की जानकारी और सहायता।',
  },
  {
    label: 'Sanchar Saathi',
    url: 'https://sancharsaathi.gov.in/',
    en: 'Mobile and telecom safety services.',
    hi: 'मोबाइल और दूरसंचार सुरक्षा सेवाएँ।',
  },
];
