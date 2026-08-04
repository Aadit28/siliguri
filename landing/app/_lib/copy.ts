export const LANGS = ["en", "hi", "mr"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, { native: string; latin: string }> = {
  en: { native: "English", latin: "English" },
  hi: { native: "हिंदी", latin: "Hindi" },
  mr: { native: "मराठी", latin: "Marathi" },
};

export const isDeva = (lang: Lang) => lang !== "en";

export type CityKey = "siliguri" | "bengaluru" | "ahilyanagar";

/**
 * Counts are read off the datasets the app actually ships
 * (src/data/services*.json), not rounded for looks. If those files change these
 * must be recounted.
 */
export const CITIES: {
  key: CityKey;
  total: number;
  counts: Record<
    | "elder_home"
    | "doctor"
    | "hospital"
    | "medical_shop"
    | "travel_agent"
    | "home_service"
    | "daily_service",
    number
  >;
}[] = [
  {
    key: "siliguri",
    total: 58,
    counts: {
      elder_home: 6,
      doctor: 6,
      hospital: 7,
      medical_shop: 14,
      travel_agent: 6,
      home_service: 6,
      daily_service: 13,
    },
  },
  {
    key: "bengaluru",
    total: 55,
    counts: {
      elder_home: 10,
      doctor: 5,
      hospital: 13,
      medical_shop: 7,
      travel_agent: 8,
      home_service: 5,
      daily_service: 7,
    },
  },
  {
    key: "ahilyanagar",
    total: 35,
    counts: {
      elder_home: 2,
      doctor: 4,
      hospital: 10,
      medical_shop: 5,
      travel_agent: 3,
      home_service: 3,
      daily_service: 8,
    },
  },
];

export const TOTAL_LISTINGS = CITIES.reduce((sum, c) => sum + c.total, 0);

const en = {
  nav: {
    how: "How it works",
    directory: "Directory",
    access: "Accessibility",
    cta: "Get early access",
    langLabel: "Language",
  },
  cities: {
    siliguri: "Siliguri",
    bengaluru: "Bengaluru",
    ahilyanagar: "Ahilyanagar",
  },
  states: {
    siliguri: "West Bengal",
    bengaluru: "Karnataka",
    ahilyanagar: "Maharashtra",
  },
  hero: {
    eyebrow: "Three cities · India",
    headline: "Care for your parents, from anywhere.",
    sub: "Verified services near their home, reminders that ring, and an assistant that answers in your language.",
    ctaPrimary: "Get early access",
    ctaSecondary: "See how it works",
    screens: [
      { label: "Services" },
      { label: "Assistant" },
      { label: "Today" },
    ],
    cards: {
      listingsLabel: "verified listings",
      tags: { directory: "Verified", assistant: "Assistant", reminders: "Reminders", sos: "Emergency" },
      assistantLabel: "Ask in Hindi or English",
      remindersLabel: "Reminders that ring",
      remindersNote: "Saved on one confirming tap.",
      sosNote: "One tap from every screen, day or night.",
    },
  },
  distance: {
    heading: "Most families are split across time zones.",
    body: "Reminders ring on your parents' clock. Guardians read every timestamp in IST, wherever they happen to be sitting, so nobody has to do the arithmetic at 2am.",
    clockIndia: "India · IST",
    clockYou: "Your time",
    clockDevice: "Your device",
  },
  portals: {
    heading: "One app, three people signed into it.",
    sub: "Who you are decides what you see. The elder never has to learn the guardian's screens, and city staff never see another city's families.",
    parent: {
      title: "Parent",
      role: "The elder, at home",
      body: "Doctors, hospitals, medicine shops and transport that someone has actually checked. Ask for what you need in Hindi or English, by typing or out loud, and get a name and a number back.",
      bullets: [
        "Reminders that ring on one tap",
        "Community board, moderated",
        "Help desk that dials for you",
      ],
    },
    guardian: {
      title: "Guardian",
      role: "The adult child, anywhere",
      body: "Link to a parent's account with their consent, then set reminders on their behalf, keep a care team of trusted numbers, and ask how the week has gone.",
    },
    admin: {
      title: "Admin",
      role: "City operations staff",
      body: "Curates the directory, publishes announcements, works the callback queue and manages city helpers. Every query is scoped to one city, so staff in one city only ever see that city.",
    },
  },
  assistant: {
    eyebrow: "The assistant",
    heading: "Say it the way you would say it to your daughter.",
    listening: "Listening · hi-IN",
    gloss: "“Remind me to take my BP medicine every day at 8pm.”",
    note: "On the web build the mic dictates in Hindi or Indian English, and a spoken question gets a spoken answer back.",
    caption: "One sentence in, one saved reminder out.",
    card: {
      title: "New reminder",
      what: "What",
      whatValue: "बीपी की दवा",
      when: "When",
      whenValue: "8:00 PM",
      repeats: "Repeats",
      repeatsValue: "Every day",
      save: "Save reminder",
    },
  },
  directory: {
    eyebrow: "The directory",
    heading: (n: number) => `${n} listings someone actually checked.`,
    body: "Search it, call from it, save the ones your family will need again. It keeps working offline from a bundled copy of your city's data.",
    inCity: (city: string) => `in ${city}`,
    categories: {
      elder_home: "Elder care & homes",
      doctor: "Doctors",
      hospital: "Hospitals",
      medical_shop: "Medical shops",
      travel_agent: "Travel & transport",
      home_service: "Home services",
      daily_service: "Daily & civic help",
    },
    requestCta: "Request a city",
    requestNote: "Not on the list? Tell us where your parents live.",
  },
  access: {
    heading: "Sized and worded for someone reading without their glasses on.",
    stats: [
      {
        value: "15px",
        label: "Smallest type anywhere",
        note: "The scale floor was raised in measured steps for readers past 70.",
      },
      {
        value: "56px",
        label: "Minimum touch target",
        note: "Big enough for an unsteady hand on a bus.",
      },
      {
        value: "4.5:1",
        label: "Contrast floor, measured",
        note: "Greys were darkened until every one of them cleared WCAG AA.",
      },
      {
        value: "हिंदी",
        label: "Default language",
        note: "English is one tap away, and the assistant answers in either.",
        deva: true,
      },
    ],
  },
  safety: {
    heading: "The careful parts are the ones you cannot see.",
    points: [
      {
        title: "Posts are read before they appear",
        body: "The community board is moderated. Nothing a stranger writes goes public until a human has looked at it.",
      },
      {
        title: "A guardian is linked, not assumed",
        body: "An adult child only sees a parent's activity after that parent has agreed to the link on their own phone.",
      },
      {
        title: "Staff see one city",
        body: "Admin queries are scoped by city, so operations staff never read another city's families.",
      },
    ],
    sosBody:
      "One tap from every screen. Saathi coordinates calls and next steps; it is not a medical device or an emergency responder.",
  },
  waitlist: {
    heading: "Three cities now. Yours next.",
    body: "The pilot is small on purpose: a real directory, real families, and enough attention to fix what breaks. Tell us where you fit and we will get in touch when there is a place for you.",
    specs: [
      ["Runs on", "iPhone, Android and any browser"],
      ["Languages", "Hindi by default, English one tap away"],
      ["Costs", "Nothing during the pilot"],
    ] as [string, string][],
    nameLabel: "Your name",
    namePlaceholder: "Priya Sharma",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    emailHelp: "Used once, to tell you the pilot has opened.",
    roleLegend: "Who is this for?",
    roles: {
      family: "My parents live in one of these cities",
      elder: "I live in one of these cities myself",
      partner: "I work for a city or an NGO",
      city: "My city is not on the list yet",
    },
    cityLabel: "Which city?",
    cityPlaceholder: "City, state",
    submit: "Get early access",
    sending: "Sending",
    successTitle: "You are on the list.",
    successBody:
      "We will write from a Saathi address before the pilot opens. No newsletter, no forwarding your details on.",
    genericError: "Something went wrong. Please try again.",
    networkError: "We could not reach the server. Please try again.",
  },
  footer: {
    tagline:
      "Elder care and local services for families in India. iOS, Android and web, in Hindi and English.",
    disclaimer:
      "Saathi is a pilot. It coordinates calls and next steps, and is not a medical device, a doctor or an emergency responder.",
  },
  gate: {
    title: "Choose a language",
    sub: "You can change this at any time from the top of the page.",
    appNote: "The app itself runs in Hindi and English today.",
  },
};

export type Dict = typeof en;

const hi: Dict = {
  nav: {
    how: "यह कैसे काम करता है",
    directory: "डायरेक्टरी",
    access: "सुगम्यता",
    cta: "जल्दी पहुँच पाएँ",
    langLabel: "भाषा",
  },
  cities: {
    siliguri: "सिलीगुड़ी",
    bengaluru: "बेंगलुरु",
    ahilyanagar: "अहिल्यानगर",
  },
  states: {
    siliguri: "पश्चिम बंगाल",
    bengaluru: "कर्नाटक",
    ahilyanagar: "महाराष्ट्र",
  },
  hero: {
    eyebrow: "तीन शहर · भारत",
    headline: "कहीं से भी अपने माता-पिता का ख़याल रखें।",
    sub: "जाँची-परखी स्थानीय सेवाएँ, समय पर बजने वाले रिमाइंडर, और आपकी भाषा में जवाब देने वाला असिस्टेंट।",
    ctaPrimary: "जल्दी पहुँच पाएँ",
    ctaSecondary: "देखिए यह कैसे काम करता है",
    screens: [
      { label: "सेवाएँ" },
      { label: "सहायक" },
      { label: "आज" },
    ],
    cards: {
      listingsLabel: "जाँची हुई लिस्टिंग",
      tags: { directory: "जाँच", assistant: "सहायक", reminders: "रिमाइंडर", sos: "आपातकाल" },
      assistantLabel: "हिंदी या अंग्रेज़ी में पूछिए",
      remindersLabel: "बजने वाले रिमाइंडर",
      remindersNote: "एक पुष्टि वाले टैप पर सेव।",
      sosNote: "हर स्क्रीन से एक टैप, दिन हो या रात।",
    },
  },
  distance: {
    heading: "ज़्यादातर परिवार अलग-अलग टाइम ज़ोन में बँटे हैं।",
    body: "रिमाइंडर माता-पिता की घड़ी पर बजते हैं। गार्जियन हर समय IST में देखते हैं, चाहे वे कहीं भी बैठे हों, ताकि रात दो बजे किसी को हिसाब न लगाना पड़े।",
    clockIndia: "भारत · IST",
    clockYou: "आपका समय",
    clockDevice: "आपका डिवाइस",
  },
  portals: {
    heading: "एक ऐप, उसमें तीन तरह के लोग।",
    sub: "आप कौन हैं, यह तय करता है कि आपको क्या दिखेगा। बुज़ुर्ग को गार्जियन की स्क्रीन सीखनी नहीं पड़ती, और शहर का स्टाफ़ कभी दूसरे शहर के परिवार नहीं देखता।",
    parent: {
      title: "माता-पिता",
      role: "घर पर रहने वाले बुज़ुर्ग",
      body: "डॉक्टर, अस्पताल, दवा की दुकानें और आने-जाने के साधन, जिन्हें किसी ने सचमुच जाँचा है। हिंदी या अंग्रेज़ी में, लिखकर या बोलकर पूछिए, और नाम तथा नंबर पाइए।",
      bullets: [
        "एक टैप पर बजने वाले रिमाइंडर",
        "मॉडरेट किया गया कम्युनिटी बोर्ड",
        "हेल्प डेस्क, जो आपके लिए कॉल मिलाती है",
      ],
    },
    guardian: {
      title: "गार्जियन",
      role: "बड़ी संतान, कहीं भी",
      body: "माता-पिता की सहमति से उनके खाते से जुड़िए, फिर उनकी ओर से रिमाइंडर लगाइए, भरोसेमंद नंबरों की केयर टीम रखिए, और पूछिए कि हफ़्ता कैसा बीता।",
    },
    admin: {
      title: "एडमिन",
      role: "शहर का संचालन स्टाफ़",
      body: "डायरेक्टरी सँभालता है, सूचनाएँ जारी करता है, कॉलबैक कतार निपटाता है और शहर के हेल्पर मैनेज करता है। हर क्वेरी एक ही शहर तक सीमित है, इसलिए स्टाफ़ को सिर्फ़ अपना शहर दिखता है।",
    },
  },
  assistant: {
    eyebrow: "असिस्टेंट",
    heading: "जैसे अपनी बेटी से कहते हैं, वैसे ही कहिए।",
    listening: "सुन रहा है · hi-IN",
    gloss: "“मुझे रोज़ शाम 8 बजे बीपी की दवा याद दिलाना।”",
    note: "वेब पर माइक हिंदी या भारतीय अंग्रेज़ी में लिखता है, और बोले गए सवाल का जवाब बोलकर मिलता है।",
    caption: "एक वाक्य अंदर, एक सेव किया हुआ रिमाइंडर बाहर।",
    card: {
      title: "नया रिमाइंडर",
      what: "क्या",
      whatValue: "बीपी की दवा",
      when: "कब",
      whenValue: "रात 8:00",
      repeats: "दोहराव",
      repeatsValue: "हर दिन",
      save: "रिमाइंडर सेव करें",
    },
  },
  directory: {
    eyebrow: "डायरेक्टरी",
    heading: (n: number) => `${n} लिस्टिंग, जिन्हें किसी ने सचमुच जाँचा है।`,
    body: "खोजिए, वहीं से कॉल कीजिए, और जिन्हें परिवार को दोबारा चाहिए होंगी उन्हें सेव कर लीजिए। इंटरनेट न हो तो भी यह आपके शहर की सहेजी हुई प्रति से चलती रहती है।",
    inCity: (city: string) => `${city} में`,
    categories: {
      elder_home: "बुज़ुर्ग देखभाल और घर",
      doctor: "डॉक्टर",
      hospital: "अस्पताल",
      medical_shop: "दवा की दुकानें",
      travel_agent: "यात्रा और परिवहन",
      home_service: "घरेलू सेवाएँ",
      daily_service: "रोज़मर्रा और नागरिक मदद",
    },
    requestCta: "अपना शहर बताइए",
    requestNote: "सूची में नहीं है? बताइए आपके माता-पिता कहाँ रहते हैं।",
  },
  access: {
    heading: "उनके लिए बनाया गया, जो बिना चश्मे के पढ़ रहे हैं।",
    stats: [
      {
        value: "15px",
        label: "सबसे छोटा टेक्स्ट",
        note: "70 पार के पाठकों के लिए यह न्यूनतम आकार नाप-तौल कर बढ़ाया गया।",
      },
      {
        value: "56px",
        label: "न्यूनतम टच टारगेट",
        note: "बस में काँपते हाथ के लिए भी काफ़ी बड़ा।",
      },
      {
        value: "4.5:1",
        label: "मापा हुआ कंट्रास्ट",
        note: "हर स्लेटी रंग तब तक गहरा किया गया जब तक वह WCAG AA पार न कर ले।",
      },
      {
        value: "हिंदी",
        label: "डिफ़ॉल्ट भाषा",
        note: "अंग्रेज़ी एक टैप दूर है, और असिस्टेंट दोनों में जवाब देता है।",
        deva: true,
      },
    ],
  },
  safety: {
    heading: "जो हिस्से दिखते नहीं, वही सबसे ध्यान से बनाए गए हैं।",
    points: [
      {
        title: "पोस्ट दिखने से पहले पढ़ी जाती है",
        body: "कम्युनिटी बोर्ड मॉडरेट होता है। कोई अजनबी जो लिखता है, वह किसी इंसान के देखे बिना सार्वजनिक नहीं होता।",
      },
      {
        title: "गार्जियन जोड़ा जाता है, मान नहीं लिया जाता",
        body: "बड़ी संतान माता-पिता की गतिविधि तभी देख पाती है जब माता-पिता अपने फ़ोन पर उस जुड़ाव को मंज़ूरी दें।",
      },
      {
        title: "स्टाफ़ को एक ही शहर दिखता है",
        body: "एडमिन क्वेरी शहर तक सीमित हैं, इसलिए संचालन स्टाफ़ कभी दूसरे शहर के परिवार नहीं पढ़ता।",
      },
    ],
    sosBody:
      "हर स्क्रीन से एक टैप दूर। साथी कॉल और अगले क़दम जोड़ता है; यह मेडिकल डिवाइस या आपातकालीन सेवा नहीं है।",
  },
  waitlist: {
    heading: "अभी तीन शहर। अगला आपका।",
    body: "पायलट जान-बूझकर छोटा है: असली डायरेक्टरी, असली परिवार, और जो टूटे उसे ठीक करने भर का ध्यान। बताइए आप कहाँ फ़िट होते हैं, जगह बनते ही हम संपर्क करेंगे।",
    specs: [
      ["चलता है", "आईफ़ोन, एंड्रॉयड और किसी भी ब्राउज़र पर"],
      ["भाषाएँ", "डिफ़ॉल्ट हिंदी, अंग्रेज़ी एक टैप दूर"],
      ["ख़र्च", "पायलट के दौरान कुछ नहीं"],
    ],
    nameLabel: "आपका नाम",
    namePlaceholder: "प्रिया शर्मा",
    emailLabel: "ईमेल",
    emailPlaceholder: "you@example.com",
    emailHelp: "सिर्फ़ एक बार इस्तेमाल होगा, यह बताने के लिए कि पायलट खुल गया।",
    roleLegend: "यह किसके लिए है?",
    roles: {
      family: "मेरे माता-पिता इनमें से किसी शहर में रहते हैं",
      elder: "मैं ख़ुद इनमें से किसी शहर में रहता/रहती हूँ",
      partner: "मैं किसी शहर या NGO के लिए काम करता/करती हूँ",
      city: "मेरा शहर अभी सूची में नहीं है",
    },
    cityLabel: "कौन सा शहर?",
    cityPlaceholder: "शहर, राज्य",
    submit: "जल्दी पहुँच पाएँ",
    sending: "भेजा जा रहा है",
    successTitle: "आप सूची में हैं।",
    successBody:
      "पायलट खुलने से पहले हम साथी के पते से लिखेंगे। कोई न्यूज़लेटर नहीं, आपकी जानकारी किसी और को नहीं।",
    genericError: "कुछ गड़बड़ हो गई। दोबारा कोशिश कीजिए।",
    networkError: "सर्वर तक नहीं पहुँच सके। दोबारा कोशिश कीजिए।",
  },
  footer: {
    tagline:
      "भारत के परिवारों के लिए बुज़ुर्ग देखभाल और स्थानीय सेवाएँ। आईओएस, एंड्रॉयड और वेब पर, हिंदी और अंग्रेज़ी में।",
    disclaimer:
      "साथी एक पायलट है। यह कॉल और अगले क़दम जोड़ता है, और मेडिकल डिवाइस, डॉक्टर या आपातकालीन सेवा नहीं है।",
  },
  gate: {
    title: "भाषा चुनिए",
    sub: "आप इसे पेज के ऊपर से कभी भी बदल सकते हैं।",
    appNote: "ऐप फ़िलहाल हिंदी और अंग्रेज़ी में चलता है।",
  },
};

const mr: Dict = {
  nav: {
    how: "हे कसे चालते",
    directory: "डिरेक्टरी",
    access: "सुलभता",
    cta: "लवकर प्रवेश मिळवा",
    langLabel: "भाषा",
  },
  cities: {
    siliguri: "सिलिगुडी",
    bengaluru: "बेंगळुरू",
    ahilyanagar: "अहिल्यानगर",
  },
  states: {
    siliguri: "पश्चिम बंगाल",
    bengaluru: "कर्नाटक",
    ahilyanagar: "महाराष्ट्र",
  },
  hero: {
    eyebrow: "तीन शहरे · भारत",
    headline: "कुठूनही आपल्या आई-वडिलांची काळजी घ्या.",
    sub: "तपासलेल्या स्थानिक सेवा, वेळेवर वाजणारे रिमाइंडर, आणि तुमच्या भाषेत उत्तर देणारा असिस्टंट.",
    ctaPrimary: "लवकर प्रवेश मिळवा",
    ctaSecondary: "हे कसे चालते ते पाहा",
    screens: [
      { label: "सेवा" },
      { label: "असिस्टंट" },
      { label: "आज" },
    ],
    cards: {
      listingsLabel: "तपासलेल्या नोंदी",
      tags: { directory: "तपासणी", assistant: "असिस्टंट", reminders: "रिमाइंडर", sos: "आणीबाणी" },
      assistantLabel: "हिंदी किंवा इंग्रजीत विचारा",
      remindersLabel: "वाजणारे रिमाइंडर",
      remindersNote: "एका होकाराच्या टॅपवर सेव्ह.",
      sosNote: "प्रत्येक स्क्रीनवरून एका टॅपवर, दिवस असो वा रात्र.",
    },
  },
  distance: {
    heading: "बहुतेक कुटुंबे वेगवेगळ्या टाइम झोनमध्ये विभागली आहेत.",
    body: "रिमाइंडर आई-वडिलांच्या घड्याळावर वाजतात. पालक कुठेही असले तरी त्यांना प्रत्येक वेळ IST मध्येच दिसते, म्हणजे रात्री दोन वाजता कुणालाही हिशेब करावा लागत नाही.",
    clockIndia: "भारत · IST",
    clockYou: "तुमची वेळ",
    clockDevice: "तुमचे डिव्हाइस",
  },
  portals: {
    heading: "एकच अ‍ॅप, त्यात तीन प्रकारची माणसे.",
    sub: "तुम्ही कोण आहात यावर तुम्हाला काय दिसेल हे ठरते. ज्येष्ठांना पालकाच्या स्क्रीन शिकाव्या लागत नाहीत, आणि शहराच्या कर्मचाऱ्यांना दुसऱ्या शहरातील कुटुंबे कधीच दिसत नाहीत.",
    parent: {
      title: "आई-वडील",
      role: "घरी असलेले ज्येष्ठ",
      body: "डॉक्टर, रुग्णालये, औषधांची दुकाने आणि प्रवासाची साधने, जी कुणीतरी खरोखर तपासली आहेत. हिंदी किंवा इंग्रजीत, लिहून किंवा बोलून विचारा, आणि नाव व नंबर मिळवा.",
      bullets: [
        "एका टॅपवर वाजणारे रिमाइंडर",
        "मॉडरेट केलेला कम्युनिटी बोर्ड",
        "तुमच्यासाठी फोन लावणारा हेल्प डेस्क",
      ],
    },
    guardian: {
      title: "पालक",
      role: "मोठे मूल, कुठेही",
      body: "आई-वडिलांच्या संमतीने त्यांच्या खात्याशी जोडा, मग त्यांच्या वतीने रिमाइंडर लावा, विश्वासातल्या नंबरांची केअर टीम ठेवा, आणि आठवडा कसा गेला ते विचारा.",
    },
    admin: {
      title: "अ‍ॅडमिन",
      role: "शहराचे संचालन कर्मचारी",
      body: "डिरेक्टरी सांभाळतात, सूचना प्रसिद्ध करतात, कॉलबॅक रांग हाताळतात आणि शहरातील मदतनीस व्यवस्थापित करतात. प्रत्येक क्वेरी एकाच शहरापुरती मर्यादित असते, त्यामुळे कर्मचाऱ्यांना फक्त त्यांचेच शहर दिसते.",
    },
  },
  assistant: {
    eyebrow: "असिस्टंट",
    heading: "मुलीशी बोलता तसेच बोला.",
    listening: "ऐकत आहे · hi-IN",
    gloss: "“मला रोज संध्याकाळी 8 वाजता बीपीचे औषध आठवण करून दे.”",
    note: "वेबवर माइक हिंदी किंवा भारतीय इंग्रजीत लिहून घेतो, आणि बोललेल्या प्रश्नाचे उत्तर बोलून मिळते.",
    caption: "एक वाक्य आत, एक सेव्ह केलेला रिमाइंडर बाहेर.",
    card: {
      title: "नवीन रिमाइंडर",
      what: "काय",
      whatValue: "बीपी की दवा",
      when: "केव्हा",
      whenValue: "रात्री 8:00",
      repeats: "पुनरावृत्ती",
      repeatsValue: "दररोज",
      save: "रिमाइंडर सेव्ह करा",
    },
  },
  directory: {
    eyebrow: "डिरेक्टरी",
    heading: (n: number) => `${n} नोंदी, ज्या कुणीतरी खरोखर तपासल्या आहेत.`,
    body: "शोधा, तिथूनच फोन लावा, आणि कुटुंबाला पुन्हा लागतील त्या सेव्ह करून ठेवा. इंटरनेट नसले तरी ती तुमच्या शहराच्या साठवलेल्या प्रतीवरून चालत राहते.",
    inCity: (city: string) => `${city} मध्ये`,
    categories: {
      elder_home: "ज्येष्ठ काळजी आणि निवास",
      doctor: "डॉक्टर",
      hospital: "रुग्णालये",
      medical_shop: "औषधांची दुकाने",
      travel_agent: "प्रवास आणि वाहतूक",
      home_service: "घरगुती सेवा",
      daily_service: "दैनंदिन आणि नागरी मदत",
    },
    requestCta: "तुमचे शहर सुचवा",
    requestNote: "यादीत नाही? तुमचे आई-वडील कुठे राहतात ते सांगा.",
  },
  access: {
    heading: "चष्म्याशिवाय वाचणाऱ्यासाठी आकार आणि शब्द निवडले आहेत.",
    stats: [
      {
        value: "15px",
        label: "सर्वात लहान अक्षर",
        note: "सत्तरीपुढच्या वाचकांसाठी ही किमान मर्यादा मोजून वाढवली आहे.",
      },
      {
        value: "56px",
        label: "किमान टच टार्गेट",
        note: "बसमध्ये थरथरणाऱ्या हातालाही पुरेसे मोठे.",
      },
      {
        value: "4.5:1",
        label: "मोजलेला कॉन्ट्रास्ट",
        note: "प्रत्येक करडा रंग WCAG AA पार करेपर्यंत गडद केला गेला.",
      },
      {
        value: "हिंदी",
        label: "डीफॉल्ट भाषा",
        note: "इंग्रजी एका टॅपवर आहे, आणि असिस्टंट दोन्हींत उत्तर देतो.",
        deva: true,
      },
    ],
  },
  safety: {
    heading: "जे भाग दिसत नाहीत, तेच सर्वात काळजीपूर्वक बांधले आहेत.",
    points: [
      {
        title: "पोस्ट दिसण्यापूर्वी वाचली जाते",
        body: "कम्युनिटी बोर्ड मॉडरेट केला जातो. अनोळखी माणूस जे लिहितो ते माणसाने पाहिल्याशिवाय जाहीर होत नाही.",
      },
      {
        title: "पालक जोडला जातो, गृहीत धरला जात नाही",
        body: "आई-वडिलांनी स्वतःच्या फोनवर संमती दिल्यावरच मोठ्या मुलाला त्यांची हालचाल दिसते.",
      },
      {
        title: "कर्मचाऱ्यांना एकच शहर दिसते",
        body: "अ‍ॅडमिन क्वेरी शहरापुरत्या मर्यादित आहेत, त्यामुळे संचालन कर्मचारी दुसऱ्या शहरातील कुटुंबे कधीच वाचत नाहीत.",
      },
    ],
    sosBody:
      "प्रत्येक स्क्रीनवरून एका टॅपवर. साथी फोन आणि पुढची पावले जुळवते; ते वैद्यकीय उपकरण किंवा आपत्कालीन सेवा नाही.",
  },
  waitlist: {
    heading: "आता तीन शहरे. पुढचे तुमचे.",
    body: "पायलट मुद्दाम लहान ठेवला आहे: खरी डिरेक्टरी, खरी कुटुंबे, आणि जे बिघडेल ते दुरुस्त करण्याइतके लक्ष. तुम्ही कुठे बसता ते सांगा, जागा होताच आम्ही संपर्क करू.",
    specs: [
      ["चालते", "आयफोन, अँड्रॉइड आणि कोणत्याही ब्राउझरवर"],
      ["भाषा", "डीफॉल्ट हिंदी, इंग्रजी एका टॅपवर"],
      ["खर्च", "पायलटदरम्यान काहीही नाही"],
    ],
    nameLabel: "तुमचे नाव",
    namePlaceholder: "प्रिया शर्मा",
    emailLabel: "ईमेल",
    emailPlaceholder: "you@example.com",
    emailHelp: "पायलट सुरू झाल्याचे कळवण्यासाठी एकदाच वापरला जाईल.",
    roleLegend: "हे कुणासाठी आहे?",
    roles: {
      family: "माझे आई-वडील यांपैकी एका शहरात राहतात",
      elder: "मी स्वतः यांपैकी एका शहरात राहतो/राहते",
      partner: "मी एखाद्या शहरासाठी किंवा NGO साठी काम करतो/करते",
      city: "माझे शहर अजून यादीत नाही",
    },
    cityLabel: "कोणते शहर?",
    cityPlaceholder: "शहर, राज्य",
    submit: "लवकर प्रवेश मिळवा",
    sending: "पाठवत आहे",
    successTitle: "तुम्ही यादीत आहात.",
    successBody:
      "पायलट सुरू होण्यापूर्वी आम्ही साथीच्या पत्त्यावरून लिहू. वृत्तपत्र नाही, तुमची माहिती इतर कुणाला नाही.",
    genericError: "काहीतरी चुकले. पुन्हा प्रयत्न करा.",
    networkError: "सर्व्हरपर्यंत पोहोचता आले नाही. पुन्हा प्रयत्न करा.",
  },
  footer: {
    tagline:
      "भारतातील कुटुंबांसाठी ज्येष्ठ काळजी आणि स्थानिक सेवा. iOS, अँड्रॉइड आणि वेबवर, हिंदी आणि इंग्रजीत.",
    disclaimer:
      "साथी एक पायलट आहे. ते फोन आणि पुढची पावले जुळवते, आणि वैद्यकीय उपकरण, डॉक्टर किंवा आपत्कालीन सेवा नाही.",
  },
  gate: {
    title: "भाषा निवडा",
    sub: "तुम्ही ती पानाच्या वरून कधीही बदलू शकता.",
    appNote: "अ‍ॅप सध्या हिंदी आणि इंग्रजीत चालते.",
  },
};

export const copy: Record<Lang, Dict> = { en, hi, mr };
