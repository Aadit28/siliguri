# साथी कैसे बना है

> यह अंग्रेज़ी [architecture.md](./architecture.md) का हिंदी रूप है। दोनों साथ-साथ अपडेट रखें।

कुछ भी बदलने से पहले यही नक़्शा आपके काम आएगा। इसमें है कि कोड कहाँ रहता है, एक
request का सफ़र कैसे कटता है, और वे तीन-चार फ़ैसले कौन-से हैं जो पहले से कोई न
समझाए तो आपको उलझा देंगे।

## एक ऐप, तीन तरह के लोग

Expo का एक ही ऐप है। गार्जियन के लिए अलग बिल्ड नहीं, एडमिन के लिए अलग बिल्ड
नहीं। आप कौन हैं, इसी से तय होता है कि आपको क्या दिखेगा:

- **पैरेंट** साइन इन करके टैब बार पर पहुँचता है: Home, Services, Assistant,
  Community, Help।
- **गार्जियन** वह है जिसके नाम `family_links` में कोई active row है। साइन-इन के
  बाद लॉगिन स्क्रीन यही links देखती है और `/guardian` पर भेज देती है।
- **एडमिन** वह है जिसका `user_accounts.role` `admin` या `super_admin` है। वे
  `/admin` खोल सकते हैं। हर admin API route सर्वर पर यह भूमिका दोबारा जाँचता है,
  इसलिए क्लाइंट का गेट सिर्फ़ सुविधा है।

डेटाबेस में "guardian" नाम की कोई भूमिका है ही नहीं। गार्जियन की पूरी पहचान बस
इतनी है कि उसके पास एक link है। यहीं लोग फँसते हैं: अगर आप `role = 'guardian'`
ढूँढ रहे हैं, तो वह कहीं नहीं मिलेगा।

## डायरेक्टरी का ढाँचा

```
app/                    Expo Router. File path is the URL.
  (tabs)/               Parent-facing tabs
  guardian/             Guardian dashboard and per-parent detail
  admin.tsx             City operations console
  service/[id].tsx      Service detail
  post/[id].tsx         Community thread
  calendar.tsx          Reminder calendar
  login.tsx             Password and OTP sign-in
src/
  components/           AppHeader, sheets, UI kit, notification bell
  context/              Auth, Locale, Theme, DisplayMode
  lib/                  API clients, family sync, notifications, i18n, theme
  locales/              en.json, hi.json
  data/services.json    Offline fallback copy of the directory
api/index.js            The one serverless function; dispatches by route name
server/                 The actual handlers, one file per route, plus _lib/
scripts/
  dev-api.js            Runs the same handlers locally on port 8788
  seed.mjs              Loads the services directory
  seed-demo-accounts.mjs  Demo family and admin
supabase-*.sql          Schema and migrations, applied in order
```

## एक request का सफ़र

किसी भी संवेदनशील काम के लिए क्लाइंट सीधे Supabase से बात नहीं करता। वह `/api/*`
को कॉल करता है, और वे handlers service role key इस्तेमाल करते हैं।

```
Screen  ->  src/lib/api.ts or family.ts
        ->  src/lib/backend.ts  (adds the bearer token, 10s timeout)
        ->  /api/<route>        (vercel.json इसे api/index.js में भेजता है)
        ->  server/<route>.js   (dispatch table से load होता है)
        ->  server/_lib/auth.js (authenticate, role checks, rate limits)
        ->  Supabase (service role)
```

सारे routes एक ही serverless function से गुज़रते हैं, क्योंकि Vercel का Hobby
plan एक deployment में बारह functions की सीमा रखता है और हमारे पास बीस से ऊपर
routes हैं। dispatch table `api/index.js` में है; `scripts/dev-api.js` वही table
import करता है, इसलिए ऐसा नहीं हो सकता कि कोई route लोकल पर चले और production
में 404 दे।

`backend.ts` API का base URL चलते समय तय करता है। localhost पर यह पोर्ट 8788 की
तरफ़ इशारा करता है, ताकि बिना किसी configuration के dev API उठ जाए। production
में यह `EXPO_PUBLIC_API_BASE_URL` इस्तेमाल करता है।

सत्र अपने बनाए हुए हैं, Supabase Auth के नहीं। `server/auth/signin.js` एक PBKDF2 hash
जाँचता है और `auth_tokens` में एक random token लिख देता है; क्लाइंट उसे
AsyncStorage में रखता है। यह बात जितनी छोटी लगती है, उससे कहीं बड़ी है: **इस ऐप
में `auth.uid()` हमेशा null रहता है**, इसलिए `auth.uid()` के भरोसे लिखी कोई भी
row-level security policy कुछ नहीं करती। जिन टेबलों को सुरक्षा चाहिए वे सिर्फ़
service role वाली हैं और `api/` से होकर ही पहुँच में आती हैं।

## ऑफ़लाइन और डेमो परत

ऐप इस तरह बनाया गया है कि बिना किसी बैकएंड के, एक लैपटॉप पर, खराब wifi वाले कमरे
में, उन्हीं लोगों के सामने चल जाए जो इसे पैसा देने का फ़ैसला कर रहे हैं। इससे कोड
का एक दूसरा रास्ता बनता है, जिसकी जानकारी आपको होनी चाहिए।

`src/lib/demoAuth.ts` में तीन खाते रखे हैं। साइन-इन पहले असली बैकएंड आज़माता है,
और न चले तो एक लोकल सत्र बना देता है जिसका token `demo.` से शुरू होता है। आगे जो
भी कोड `demo.` वाला token देखता है, वह नेटवर्क की जगह `src/lib/demoFamily.ts`
इस्तेमाल करता है: links, reminders, care team, favourites, analytics।

family का कोड छूते समय दो नियम:

1. `src/lib/family.ts` के हर function में एक demo branch चाहिए। अगर आपने कोई
   network call जोड़ी और यह भूल गए, तो demo रास्ता 401 देगा और ऐप ठीक उन्हीं
   लोगों के सामने टूटा हुआ दिखेगा जिन्हें आप दिखा रहे थे।
2. demo store सिर्फ़ एक link row रखता है। दूसरा demo guardian उसी demo parent से
   जुड़ेगा तो पहला हट जाएगा। यह fixture की सीमा है, बग नहीं।

सर्वर `demo.` वाले token पर कभी भरोसा नहीं करता। `authenticate()` उसका hash
बनाता है, कोई row नहीं मिलती, और वह मना कर देता है।

## याद-दिलावे, mirroring और समय

Reminders दो जगह रहते हैं, और यह जान-बूझकर है।

Postgres में `family_reminders` वह रिकॉर्ड है जो गार्जियन लिखता है। नोटिफ़िकेशन
डिवाइस पर रखे लोकल कैलेंडर स्टोर से चलते हैं। `src/lib/familySync.ts` सर्वर की
rows को लोकल स्टोर में उतारता है और हर उतरी हुई row पर `serverId` की मुहर लगा
देता है।

वही `serverId` पूरा भार उठाता है। इसी से ऐप पहचानता है कि "यह reminder family
server से आया" और "यह उपयोगकर्ता ने खुद लिखा", और इसी से sign-out को पता चलता है
कि क्या मिटाना है। घर के साझा टैबलेट पर किसी बुज़ुर्ग की दवा वाले reminders अगले
इंसान के लिए छोड़ देना निजता की चूक होगी, इसलिए `clearFamilyForSelf()` ठीक वही
rows हटाता है जिन पर `serverId` है और उनके तय किए हुए नोटिफ़िकेशन रद्द कर देता
है।

**हर चीज़ IST से बँधी है।** पैरेंट सिलीगुड़ी में रहता है; गार्जियन शायद New
Jersey में हो। "कल 8:30" पर लगाए reminder का मतलब सिलीगुड़ी का 8:30 है। आज की
तारीख़ चाहिए तो `new Date()` की जगह `src/lib/notifications.ts` का `todayISO()`
इस्तेमाल करें, वरना विदेश बैठे गार्जियन को गलत दिन दिखेगा।

दोहराव `once`, `daily`, `weekly`, `monthly` हैं। महीने वाला `nextMonthlyISO` से
आगे बढ़ता है, जो सीमा में बाँध देता है: 31 तारीख़ का reminder छोटे महीने में उसी
महीने के आख़िरी दिन पड़ता है, छूटता नहीं।

## सहायक

`server/assistant/plan.js` repo की सबसे बड़ी फ़ाइल है। यह परतों में जवाब देती है:

1. keyword वाला planner सबसे पहले चलता है, और हमेशा चलता है। यह अंग्रेज़ी, हिंदी
   और हिंग्लिश शब्दों को सेवा की श्रेणी से मिलाता है और क्लाइंट की भेजी असली
   service rows से plan बनाता है।
2. अगर model की key सेट है और request उसके कोटे के भीतर है, तो सेट किया हुआ chat
   model (फ़ोटो होने पर OpenAI) को मौका मिलता है। model `DEEPSEEK_MODEL` से तय
   होता है और अभी OpenCode Go plan पर `kimi-k2.5` है — deepseek-v4-flash वहाँ
   region-lock हो गया। Kimi सोचने वाला model है: कभी-कभी अपने JSON के चारों तरफ़
   तर्क की गद्य लपेट देता है, इसलिए parser सबसे बाहरी `{...}` block उठाता है और
   request में 3000 output tokens की जगह रखी जाती है। लोकल planner पर हर गिरावट
   अपनी वजह log करती है — वरना मरी हुई key और सामान्य लोकल दिन एक जैसे दिखते हैं।
3. model के जवाब को लोकल plan के हिसाब से सामान्य किया जाता है। intent और status
   उपयोगकर्ता के अपने संदेश से दोबारा निकाले जाते हैं, और ऐसी हर action हटा दी
   जाती है जो उस service id की तरफ़ इशारा करे जो क्लाइंट ने भेजी ही नहीं थी।

तीसरा कदम सफ़ाई नहीं, सुरक्षा की दीवार है। इसके बिना किसी service के विवरण में
लिखा हुआ text model को बहला सकता है कि वह किसी भी मनमाने नंबर के लिए "call" बटन
दिखा दे। refactor करें तो यह गुण बनाए रखें।

चेतावनी कभी model की लिखी हुई नहीं होती। यह हर भाषा के लिए तय, जाँची हुई copy है।
बुज़ुर्गों के लिए बने सेहत से जुड़े product में ऐसा क़ानूनी बयान नहीं भेजा जा
सकता जिसके शब्द हर request पर बदल जाएँ।

कोटा fail closed है। अगर counter पढ़ा ही न जा सके, तो request बिना हिसाब के पैसे
खर्च करने के बजाय मुफ़्त लोकल planner पर उतर जाती है।

### सहायक जो reminder बना सकता है

"मुझे रोज़ रात 8 बजे BP की दवा याद दिलाना" — या अंग्रेज़ी में वही बात — जवाब में
`proposedReminder` लाती है: शीर्षक, तारीख़, समय, दोहराव। क्लाइंट उसे एक कार्ड की
तरह दिखाता है और जब तक उपयोगकर्ता Save नहीं दबाता, कुछ भी सेव नहीं होता। Save
दबाने पर वही रास्ता चलता है जो हाथ से लिखे reminder का है: लोकल कैलेंडर में
लिखना और OS का अलार्म तय करना।

Parser की दो प्रतियाँ जान-बूझकर हैं: `src/lib/reminderParse.ts` डिवाइस पर चलती
है (ऑफ़लाइन जवाबों के लिए) और उसका port `server/assistant/plan.js` के अंदर सर्वर
पर, जहाँ वह LLM के सुझाव की जाँच भी करता है। **दोनों को साथ-साथ बदलें**, और
model की तारीख़ों पर कभी भरोसा न करें: `sanitizeProposedReminder` वह सब गिरा
देता है जो असली तारीख़, असली समय और जाना-पहचाना दोहराव न हो।

### आवाज़

`src/lib/voice.ts` ब्राउज़र की SpeechRecognition (hi-IN/en-IN) और expo-speech
को लपेटता है। जहाँ recognition मौजूद है वहीं mic का बटन दिखता है — व्यवहार में
वह web build पर Chrome है; native के लिए dev-build module चाहिए, इसलिए वहाँ बटन
बनता ही नहीं। आवाज़ में जवाब चालू हों तो उत्तर बोला जाता है, और बोले हुए सवाल के
बाद mic फिर खुल जाता है, ताकि बुज़ुर्ग बिना हाथ लगाए बातचीत चला सकें। रद्द करने
पर `stop()` नहीं, `abort()` चलता है — `stop()` आख़िरी नतीजा फिर भी पहुँचा देता
और वही शब्द भेज देता जो उपयोगकर्ता ने रद्द किए थे।

## Push नोटिफ़िकेशन और deep links

लोकल reminder अलार्म को इसमें से कुछ नहीं चाहिए — वे डिवाइस पर ही तय होते हैं।
सर्वर push परिवार के चक्र के लिए है:

- गार्जियन ने बुज़ुर्ग का reminder जोड़ा या बदला -> पैरेंट का फोन बजता है
- पैरेंट ने reminder पूरा किया -> गार्जियनों के फोन बजते हैं
- पैरेंट ने SOS दबाया -> हर गार्जियन का फोन तुरंत बजता है, और आपातकालीन कॉल
  नेटवर्क का इंतज़ार किए बिना आगे बढ़ती है
- help desk ने callback को contacted या closed किया -> माँगने वाले का फोन बजता है
- रोज़ रात 8 बजे (IST) एक Vercel cron (`server/cron/daily-digest.js`) हर
  गार्जियन को हर पैरेंट का सार भेजता है, और कहने को कुछ न हो तो चुप रहता है

रास्ता: साइन-इन के बाद ऐप अपना Expo push token दर्ज करता है
(`src/lib/pushRegistration.ts` -> `/api/notify/register` -> `push_tokens`,
migration 11)। `server/_lib/push.js` Expo के API से भेजता है और जो token
`DeviceNotRegistered` लौटें उन्हें मिटा देता है। भेजना **HTTP जवाब से पहले await
होता है** — जवाब ख़त्म होते ही Vercel function को जमा देता है, इसलिए छोड़ा हुआ
promise चुपचाप मर जाता।

दो platform-सीमाएँ याद रखने लायक: नए Android पर Expo Go push token बना ही नहीं
सकता (dev build बना सकता है), और web build में Expo push है ही नहीं। हर कदम
best-effort है, इसलिए ये platform बिना error के लोकल अलार्म पर उतर जाते हैं।

नोटिफ़िकेशन के tap में `data.url` के अंदर ऐप का ही रास्ता होता है (`/calendar`,
`/guardian`, `/help`)। root layout उसे खोलता है और जो ऐप का रास्ता न हो उसे मना
कर देता है, ताकि कोई push payload बुज़ुर्ग को बाहर की साइट पर न भेज सके।
sign-out पहले token हटाता है, फिर सत्र रद्द करता है — घर का साझा टैबलेट पिछले
खाते के लिए बजता नहीं रहना चाहिए।

## दर-सीमाएँ

सीमाएँ हर serverless instance की अपनी मेमोरी में रहती हैं, इसलिए ये टिकाऊ कोटा
नहीं, अचानक आए बोझ से बचाव भर हैं। एक cold start इन्हें रीसेट कर देता है। DB पर
टिका संस्करण असली लॉन्च से पहले की सूची में है।

`requestIp()` जान-बूझकर `x-forwarded-for` की पहली entry पर भरोसा नहीं करता,
क्योंकि क्लाइंट वह header खुद सेट करके हर request पर नई bucket बना सकता है। यह
platform का header पसंद करता है, और वह न मिले तो chain की आख़िरी entry लेता है।

## शहर

हर service, announcement, callback request और staff खाते पर एक `city_id` होता है।
super-admin के अलावा बाकी स्टाफ़ को सिर्फ़ अपना शहर दिखता है, साथ में वे rows
जिन पर कोई शहर नहीं है। `supabase-migration-10-callback-city.sql` इसीलिए मौजूद
है: callback requests में नागरिक का नाम और फ़ोन नंबर होता है, और एक शहर का सहायक
दूसरे शहर की कतार नहीं पढ़ सकता।

जब आप नागरिकों का डेटा रखने वाली कोई नई टेबल बनाएँ, उसमें `city_id` डालें और
queries को सर्वर पर ही सीमित करें। छानने के लिए क्लाइंट पर भरोसा न करें।

## जो बातें आपको फँसाएँगी

**इस प्रोजेक्ट की तीन checkouts** मूल डेवलपर की मशीन पर पड़ी हैं (`Silliguri/`,
`suluguri/`, `Silliguri New/siliguri/`)। असली यही है। यह मान लेने से पहले कि आपका
बदलाव कहाँ गया, पुष्टि कर लें।

**Metro जमकर cache करता है।** बदलाव के बाद अगर browser में पुराना व्यवहार दिखे,
तो भूत का पीछा करने के बजाय dev server दोबारा चालू करें।

**रुका हुआ Supabase प्रोजेक्ट अपना DNS खो देता है।** hostname हल होना ही बंद कर
देता है और हर कॉल name-resolution error से गिरती है, जो बिल्कुल ऐसा दिखता है
मानो प्रोजेक्ट मिटा दिया गया हो। डेटा गया मान लेने से पहले dashboard देखें।
