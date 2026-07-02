export type ConnectorStatus = 'live' | 'partial' | 'planned';

export type Connector = {
  id: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  status: ConnectorStatus;
  kind: 'payment' | 'transport' | 'calendar' | 'family' | 'emergency';
  configNote?: string;
  configNoteHi?: string;
};

// Central registry of external integrations. Deep-link connectors are 'live',
// template-link ones 'partial', and future APIs 'planned' so they have a home
// in code and in the Connections screen before any server work lands.
export const CONNECTORS: Connector[] = [
  {
    // upi:// deep link — see src/lib/payments.ts (buildUpiUrl/openUpiPayment).
    id: 'upi',
    name: 'UPI payments',
    nameHi: 'यूपीआई भुगतान',
    description:
      'Pay with Google Pay, PhonePe or any UPI app. Saathi opens your UPI app with the details already filled in.',
    descriptionHi:
      'गूगल पे, फोनपे या किसी भी यूपीआई ऐप से भुगतान करें। साथी आपका यूपीआई ऐप विवरण भरकर खोल देता है।',
    status: 'live',
    kind: 'payment',
  },
  {
    // No-OAuth template links today — see googleCalendarUrl in src/lib/calendar.ts.
    id: 'google_calendar',
    name: 'Google Calendar',
    nameHi: 'गूगल कैलेंडर',
    description:
      'Add reminders to Google Calendar. Today Saathi opens Google Calendar with the event filled in — you just press Save.',
    descriptionHi:
      'गूगल कैलेंडर में रिमाइंडर जोड़ें। अभी साथी गूगल कैलेंडर को इवेंट भरकर खोलता है — आपको बस सेव दबाना है।',
    status: 'partial',
    kind: 'calendar',
    // Tech plan: Google OAuth for a direct account connection.
    configNote: 'A direct connection to your Google account is coming soon.',
    configNoteHi: 'आपके गूगल खाते से सीधा जुड़ाव जल्द आ रहा है।',
  },
  {
    // Ride request via m.uber.com/ul/ universal deep link.
    id: 'uber',
    name: 'Uber',
    nameHi: 'उबर',
    description:
      'Book a ride. Saathi opens Uber with your destination already filled in.',
    descriptionHi:
      'सवारी बुक करें। साथी उबर को आपकी मंज़िल भरकर खोल देता है।',
    status: 'live',
    kind: 'transport',
    // Tech plan: Uber API (server key) — in-app booking with fare estimate.
    configNote: 'Soon you will be able to book and see the fare inside Saathi.',
    configNoteHi: 'जल्द ही आप साथी के अंदर ही बुकिंग कर सकेंगे और किराया देख सकेंगे।',
  },
  {
    id: 'ola',
    name: 'Ola',
    nameHi: 'ओला',
    description: 'Book Ola rides from Saathi. Coming soon.',
    descriptionHi: 'साथी से ओला सवारी बुक करें। जल्द आ रहा है।',
    status: 'planned',
    kind: 'transport',
    // Tech plan: Ola API.
    configNote: 'The Ola connection is being built.',
    configNoteHi: 'ओला से जुड़ाव बनाया जा रहा है।',
  },
  {
    id: 'whatsapp_family',
    name: 'WhatsApp family updates',
    nameHi: 'व्हाट्सएप परिवार अपडेट',
    description:
      'Send updates to your family on WhatsApp automatically. Coming soon.',
    descriptionHi:
      'व्हाट्सएप पर अपने परिवार को अपने आप अपडेट भेजें। जल्द आ रहा है।',
    status: 'planned',
    kind: 'family',
    // Tech plan: WhatsApp Business API.
    configNote: 'The WhatsApp connection is being built.',
    configNoteHi: 'व्हाट्सएप से जुड़ाव बनाया जा रहा है।',
  },
  {
    // tel: link — one-tap phone call.
    id: 'emergency_108',
    name: 'Emergency 108',
    nameHi: 'आपातकाल 108',
    description: 'Call an ambulance or emergency help with one tap.',
    descriptionHi: 'एक टैप में एम्बुलेंस या आपातकालीन मदद के लिए कॉल करें।',
    status: 'live',
    kind: 'emergency',
  },
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((connector) => connector.id === id);
}
