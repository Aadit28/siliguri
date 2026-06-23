// Hindi translations for the SEEDED / demo community content.
//
// App labels are translated via i18n (en.json / hi.json). But community posts
// are free-text DATA, so they can't be translated by key. This dictionary
// covers the content we ship with the app; anything not found (e.g. a post a
// real user types) gracefully falls back to the original text.
//
// Business names (Apollo, North Bengal Tourism, …) are intentionally NOT
// translated — proper nouns read the same in every language.

const HI: Record<string, string> = {
  // Post — best practice
  'Tip: keep a printed medicine list on the fridge':
    'सुझाव: दवाइयों की छपी हुई सूची फ्रिज पर लगाकर रखें',
  'For my parents I printed a big list of their medicines and timings and stuck it on the fridge. Helps any helper or neighbour in an emergency.':
    'अपने माता-पिता के लिए मैंने उनकी दवाइयों और समय की एक बड़ी सूची छापकर फ्रिज पर चिपका दी। आपात स्थिति में किसी भी सहायक या पड़ोसी के लिए यह मददगार होती है।',

  // Post — general (choosing an elder care home)
  'How did you choose an elder care home in Siliguri?':
    'आपने सिलीगुड़ी में वृद्ध देखभाल गृह कैसे चुना?',
  'We are looking at a few care homes for my mother. What did others look for when visiting — staff ratio, food, medical support? Would love advice.':
    'हम अपनी माँ के लिए कुछ देखभाल गृह देख रहे हैं। दौरे के समय दूसरों ने किन बातों पर ध्यान दिया — स्टाफ़ अनुपात, खाना, चिकित्सा सहायता? सलाह की बहुत ज़रूरत है।',

  // Post — health (physiotherapist) + its reply (mock data)
  'Reliable physiotherapist for my father in Siliguri?':
    'सिलीगुड़ी में मेरे पिता के लिए भरोसेमंद फिज़ियोथेरेपिस्ट?',
  'My father had a knee operation. Looking for someone trustworthy who can visit at home a few times a week. Any recommendations?':
    'मेरे पिता के घुटने का ऑपरेशन हुआ है। किसी भरोसेमंद व्यक्ति की तलाश है जो हफ़्ते में कुछ बार घर आकर देख सके। कोई सुझाव?',
  'Manipal Hospitals in Pradhan Nagar can refer a home physio — they were helpful for my mother.':
    'प्रधान नगर का मणिपाल हॉस्पिटल घर पर फिज़ियो के लिए रेफ़र कर सकता है — मेरी माँ के लिए वे मददगार रहे।',
};

/** Translate seeded content to Hindi; falls back to the original text. */
export function tContent(text: string | null | undefined, lang: 'en' | 'hi'): string {
  if (!text) return text ?? '';
  if (lang !== 'hi') return text;
  return HI[text.trim()] ?? text;
}
