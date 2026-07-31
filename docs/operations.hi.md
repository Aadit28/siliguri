# साथी को चलाना

> यह अंग्रेज़ी [operations.md](./operations.md) का हिंदी रूप है। दोनों साथ-साथ अपडेट रखें।

वह सब कुछ जो चलाने वाले को चाहिए और कोड देखकर अपने आप साफ़ नहीं होता: deploy कैसे
करें, कुछ टूट जाए तो क्या करें, और कौन-सी गड़बड़ियाँ डरावनी दिखती हैं पर हैं
नहीं।

## एनवायरनमेंट

एक Supabase प्रोजेक्ट है और एक Vercel प्रोजेक्ट। staging कोई नहीं है। उसी
डेटाबेस से जुड़े लोकल API पर जाँच करें, और seed scripts से सावधान रहें, क्योंकि
वे डालने से पहले मिटाती हैं।

वेब ऐप `main` से deploy होता है। API अपने आप deploy नहीं होता। `api/` या
`server/` में कुछ भी बदलने के बाद उसे जान-बूझकर deploy करें, और यह याद रखें कि
Vercel के environment variables `.env` की अलग प्रति हैं: एक बदलने से दूसरा नहीं
बदलता। Windows पर Vercel CLI से कोई env value सेट करें तो उसे PowerShell नहीं,
Node से pipe करें — PowerShell की pipeline आगे BOM और पीछे CRLF जोड़ देती है और
हर value चुपचाप बिगड़ जाती है।

Supabase की keys के अलावा production में दो env values मायने रखती हैं:
`DEEPSEEK_MODEL` (OpenCode Go plan पर planner का model; अभी `kimi-k2.5`, क्योंकि
deepseek-v4-flash वहाँ region-lock है) और `CRON_SECRET`, जिससे रोज़ का digest
cron पहचाना जाता है। env var मौजूद हो तो Vercel उसे अपने आप
`Authorization: Bearer <secret>` की तरह भेजता है।

## Migration लगाना

Migrations repo की जड़ में पड़ी सादी SQL फ़ाइलें हैं, जो फ़ाइल के नाम के क्रम में
लगती हैं। इन्हें कोई migration tool नहीं सँभालता, इसलिए आपको दो बार चलाने से कोई
नहीं रोकेगा। ज़्यादातर में `if not exists` की सुरक्षा लिखी है, फिर भी चलाने से
पहले पढ़ लें।

किसी एक को लगाने के लिए उसे Supabase SQL editor में चिपका दें, या personal access
token के साथ Management API इस्तेमाल करें:

```bash
curl -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @payload.json
```

schema बदलने के बाद, उस नए column पर filter करने वाला कोड भेजने से पहले जाँच लें
कि PostgREST को वह column दिख भी रहा है या नहीं। जिस column को PostgREST ने अभी
उठाया नहीं है, उसका नाम किसी filter में आते ही पूरा endpoint 500 देता है, कोई
सलीके की error नहीं, और क्लाइंट का कोई fallback आपको नहीं बचाएगा।

## डेटा भरना

```bash
node --env-file=.env scripts/seed.mjs
```

58 सिलीगुड़ी सेवाएँ और दो community posts डालती है।

```bash
node --env-file=.env scripts/seed-demo-accounts.mjs
```

`demo.parent`, `demo.guardian` और `demo.admin` को, उनके links, reminders और care
team समेत, मिटाकर दोबारा बनाती है। इसे production पर चलाने का मतलब है कि इन खातों
में अभी जो कुछ है वह मिट जाएगा, इसलिए इसे विनाशकारी ही मानें।

## जब कुछ टूट जाए

**हर request name-resolution error से गिर रही है।** Supabase प्रोजेक्ट शायद रुका
हुआ है। रुका हुआ free प्रोजेक्ट अपना DNS पूरा खो देता है, इसलिए hostname हल होना
बंद कर देता है और लगता है मानो प्रोजेक्ट मिटा दिया गया हो। dashboard से उसे
दोबारा चालू करें और एक मिनट रुकें।

**schema बदलते ही कोई endpoint 500 देने लगा।** ऊपर PostgREST वाली बात देखें। जब
तक schema cache पकड़ न ले, `*` select करें और छँटाई JavaScript में करें।

**OTP साइन-इन 503 लौटा रहा है।** WhatsApp की जानकारी नहीं भरी है। यूज़रनेम और
पासवर्ड अब भी चलते हैं। Meta Business खाता जुड़ने तक यही होना है।

**सहायक जवाब तो देता है पर बेजान लगता है।** वह लोकल keyword planner पर उतर आया
है, जो तब होता है जब model की key नहीं है, कोटा खत्म है, model का JSON पढ़ा नहीं
जा सका, या कोटे का counter पढ़ा नहीं जा सका। आख़िरी हाल जान-बूझकर ऐसा है:
counter न पढ़ा जाना यानी बिना हिसाब के खर्च, इसलिए यह fail closed होता है। 31
जुलाई की लहर से हर गिरावट अपनी वजह log करती है — अंदाज़ा लगाने से पहले function
के log देखें। `403 RegionError` का मतलब है कि सेट किया हुआ model OpenCode plan
पर region के पीछे चला गया; `GET /models` से देखें कि key को अब क्या मिलता है और
`DEEPSEEK_MODEL` बदलें — `.env` में भी और Vercel में भी।

**Push नोटिफ़िकेशन कभी पहुँचते ही नहीं।** इसी क्रम में देखें: डिवाइस dev build
होना चाहिए (नए Android पर Expo Go push token बना ही नहीं सकता; web पर Expo push
है ही नहीं); उपयोगकर्ता की `push_tokens` में row होनी चाहिए (दर्ज होना साइन-इन के
बाद और best-effort है); भेजना HTTP जवाब खत्म होने से पहले होना चाहिए (उसके बाद
Vercel function को जमा देता है)। जिन tokens को Expo `DeviceNotRegistered` बताता
है वे अपने आप मिट जाते हैं — uninstall हुए डिवाइस का टेबल से गायब होना सामान्य
है।

**रोज़ का digest गया ही नहीं।** cron 14:30 UTC (रात 8 बजे IST) पर चलता है और
`Authorization` में `CRON_SECRET` न हो तो 401 देता है। जिस पैरेंट के पास खिड़की
में कोई reminder नहीं, उसके लिए चुप रहना design है — push न आना हमेशा खराबी नहीं।
secret के साथ हाथ से चलाएँ और लौटे हुए `digests` की गिनती पढ़ें।

**कोई दर-सीमा टिक नहीं रही।** सीमाएँ हर serverless instance की अपनी मेमोरी में
रहती हैं, इसलिए cold start पर रीसेट हो जाती हैं और instances के बीच जुड़ती नहीं।
असली सख़्ती के लिए डेटाबेस वाला संस्करण चाहिए।

**बदलाव के बाद भी browser पुराना व्यवहार दिखा रहा है।** Metro ने cache कर लिया
है। भूत का पीछा करने के बजाय dev server दोबारा चालू करें।

## कॉलबैक कतार पर नज़र रखें

कॉलबैक कतार में नागरिकों के नाम और फ़ोन नंबर रहते हैं। कतार बढ़ने पर दो बातें
सही बनी रहनी चाहिए:

साइन-इन किए हुए उपयोगकर्ताओं की requests पर उनका अपना शहर होता है। बिना नाम वाली
requests उस service पेज का शहर उधार लेती हैं जहाँ से वे आई थीं, और वह भी न हो तो
उन पर कोई शहर नहीं होता। जिन rows पर शहर नहीं है वे शहर के एडमिन को दिखती हैं,
शहर के सहायकों को नहीं।

कतार 50 rows दिखाती है और pagination है ही नहीं। असली लोगों के साथ असली पायलट से
पहले इसे हल करना होगा, वरना पुरानी requests नीचे से गिरती जाएँगी और किसी की नज़र
में नहीं आएँगी।

## Deploy से पहले

पहले typecheck, फिर लोकल dev API के सामने regression suite:

```bash
npx tsc --noEmit -p tsconfig.json
```

```bash
npm run test:regression
```

Suite (`scripts/regression.mjs`) तीनों भूमिकाओं को 24 जाँचों से गुज़ारती है:
साइन-इन, दोनों भाषाओं में सहायक के जवाब, reminder के प्रस्ताव, reminder का CRUD
और validation, push का दर्ज होना, SOS, अलर्ट इनबॉक्स, एडमिन के आंशिक patch, और
भूमिकाओं का अलगाव। इसे चलता हुआ dev API और भरे हुए डेमो खाते चाहिए; यह अपनी rows
खुद बनाती-मिटाती है और किसी भी विफलता पर non-zero के साथ निकलती है।

फिर जिस पोर्टल को छुआ है, उसी के डेमो खाते से साइन इन करके क्लिक करके देखें —
suite API की सतह जाँचती है, pixels नहीं।

## क्रेडेंशियल बदलना

service role key `.env` में और Vercel के environment में रहती है। ऐप बंडल में
इसकी जगह कभी नहीं है। अगर यह लीक हो जाए, तो Supabase dashboard से इसे बदलें और
दोनों जगह अपडेट करें; तब तक हर `/api/*` route काम करना बंद कर देता है।

Migrations के लिए इस्तेमाल होने वाले personal access tokens कम समय के होने
चाहिए। काम खत्म होते ही उन्हें रद्द कर दें।
