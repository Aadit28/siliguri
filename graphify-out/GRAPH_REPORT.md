# Graph Report - c:/My projects Main/Silliguri New/siliguri  (2026-07-20)

## Corpus Check
- 89 files · ~137,365 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 572 nodes · 1304 edges · 47 communities (23 shown, 24 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Admin & Utility Screens
- Home & Service Detail UI
- Vercel API Endpoints
- Assistant Domain Logic
- Assistant Planner API
- Data Layer & Mocks
- Router Layouts & Nav
- Expo App Config
- Auth Context
- Assistant Chat Screen
- Package Manifest
- Calendar Feature
- Local Dev API Server
- TypeScript Config
- Expo Dependencies
- Voice / Speech
- Supabase Seed
- Connectors Registry
- Vercel Deploy Config
- Gemini Verify Script
- UPI Payments
- Dependency: expo-constants
- Dependency: expo-font
- Dependency: @expo-google-fonts/dm-sans
- Dependency: @expo-google-fonts/reddit-sans
- Dependency: expo-linking
- Dependency: expo-localization
- Dependency: @expo/metro-runtime
- Dependency: expo-router
- Dependency: expo-speech
- Dependency: expo-splash-screen
- Dependency: expo-sqlite
- Dependency: expo-status-bar
- Dependency: @expo/vector-icons
- Dependency: i18next
- Dependency: react-dom
- Dependency: react-i18next
- Dependency: react-native
- Dependency: react-native-reanimated
- Dependency: react-native-safe-area-context
- Dependency: react-native-screens
- Dependency: react-native-url-polyfill
- Dependency: react-native-web
- Dependency: @supabase/supabase-js
- Theme Tokens

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 53 edges
2. `useAuth()` - 19 edges
3. `expo-router` - 17 edges
4. `useLocale()` - 17 edges
5. `font` - 17 edges
6. `space` - 17 edges
7. `radius` - 16 edges
8. `Muted()` - 14 edges
9. `AppColors` - 14 edges
10. `withCors()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `SmallAvatar()` --calls--> `useTheme()`  [EXTRACTED]
  app/(tabs)/assistant.tsx → src/context/ThemeContext.tsx
- `AppSectionLayout()` --calls--> `useLocale()`  [EXTRACTED]
  app/(tabs)/_layout.tsx → src/context/LocaleContext.tsx
- `AppSectionLayout()` --calls--> `useTheme()`  [EXTRACTED]
  app/(tabs)/_layout.tsx → src/context/ThemeContext.tsx
- `AssistantScreen()` --calls--> `useAuth()`  [EXTRACTED]
  app/(tabs)/assistant.tsx → src/context/AuthContext.tsx
- `AssistantScreen()` --calls--> `useLocale()`  [EXTRACTED]
  app/(tabs)/assistant.tsx → src/context/LocaleContext.tsx

## Import Cycles
- None detected.

## Communities (47 total, 24 thin omitted)

### Community 0 - "Admin & Utility Screens"
Cohesion: 0.08
Nodes (70): AdminScreen(), Field(), fieldStyles, makeStyles(), Notice(), ConnectorsScreen(), COPY, KIND_META (+62 more)

### Community 1 - "Home & Service Detail UI"
Cohesion: 0.08
Nodes (44): formatTrustDate(), makeStyles(), ServiceDetail(), FEATURED_CATEGORY_MIX, heroImage, Home(), makeStyles(), openExternal() (+36 more)

### Community 2 - "Vercel API Endpoints"
Cohesion: 0.10
Nodes (39): { authenticate, readBody, requireAdmin, send, withCors }, { authenticate, readBody, requireAdmin, send, withCors }, CATEGORIES, logAssistantEvent(), { authenticate, publicUser, send, withCors }, {
  adminClient,
  createSession,
  localPhoneUserId,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  send,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
}, { authenticate, send, tokenHash, withCors }, {
  adminClient,
  createSession,
  localPhoneUserId,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  saveLocalPhoneAuth,
  send,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
} (+31 more)

### Community 3 - "Assistant Domain Logic"
Cohesion: 0.08
Nodes (40): AssistantActionKind, AssistantIntent, AssistantLang, AssistantMessage, AssistantPlanContext, AssistantStatus, buildDirectionsUrl(), buildLocalAssistantPlan() (+32 more)

### Community 4 - "Assistant Planner API"
Cohesion: 0.10
Nodes (34): { adminClient, authenticate, readBody, send, withCors }, buildDirectionsUrl(), buildLocalAssistantPlan(), buildRouteTimePlan(), CATEGORY_KEYWORDS, categoryForIntent(), cleanRoutePlace(), COPY (+26 more)

### Community 5 - "Data Layer & Mocks"
Cohesion: 0.10
Nodes (31): MOCK_POSTS, MOCK_SERVICES, createCallbackRequest(), createPost(), createReply(), fetchPost(), fetchReplies(), fetchService() (+23 more)

### Community 6 - "Router Layouts & Nav"
Cohesion: 0.09
Nodes (23): RootStack(), styles, AppSectionLayout(), styles, react, react, AuthProvider(), DisplayModeContext (+15 more)

### Community 7 - "Expo App Config"
Cohesion: 0.07
Nodes (27): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, expo, android (+19 more)

### Community 8 - "Auth Context"
Cohesion: 0.11
Nodes (21): AuthContext, AuthMethod, AuthState, SaathiSession, SaathiUser, appendTurn(), AssistantMemory, buildAssistantContext() (+13 more)

### Community 9 - "Assistant Chat Screen"
Cohesion: 0.13
Nodes (26): AssistantScreen(), ChatSession, ChatState, ComposerKeyPressEvent, EXAMPLE_KEYS, getInitialChatState(), getWebDocument(), getWebStorage() (+18 more)

### Community 10 - "Package Manifest"
Cohesion: 0.10
Nodes (20): babel-preset-expo, devDependencies, babel-preset-expo, @types/react, typescript, ws, engines, node (+12 more)

### Community 11 - "Calendar Feature"
Cohesion: 0.18
Nodes (19): CalendarScreen(), formatReadableDate(), makeStyles(), monthMatrix(), monthName(), toISO(), tomorrowISO(), addDaysToISO() (+11 more)

### Community 12 - "Local Dev API Server"
Cohesion: 0.20
Nodes (7): fs, http, path, PORT, ROOT, routes, server

### Community 13 - "TypeScript Config"
Cohesion: 0.25
Nodes (7): dist, expo/tsconfig.base, node_modules, compilerOptions, strict, exclude, extends

### Community 14 - "Expo Dependencies"
Cohesion: 0.29
Nodes (7): expo, expo-blur, dependencies, expo, expo-blur, @react-native-async-storage/async-storage, @react-native-async-storage/async-storage

### Community 15 - "Voice / Speech"
Cohesion: 0.43
Nodes (5): localeFor(), speak(), speechRecognitionSupported(), startListening(), VoiceLang

### Community 16 - "Supabase Seed"
Cohesion: 0.40
Nodes (3): posts, services, supabase

### Community 17 - "Connectors Registry"
Cohesion: 0.50
Nodes (4): Connector, CONNECTORS, ConnectorStatus, getConnector()

### Community 18 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, outputDirectory, rewrites, $schema

### Community 19 - "Gemini Verify Script"
Cohesion: 0.67
Nodes (3): body, call(), main()

### Community 20 - "UPI Payments"
Cohesion: 0.67
Nodes (3): buildUpiUrl(), openUpiPayment(), UpiPaymentInput

## Knowledge Gaps
- **168 isolated node(s):** `crypto`, `fs`, `path`, `{ createClient }`, `WebSocket` (+163 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `Admin & Utility Screens` to `Home & Service Detail UI`, `Calendar Feature`, `Router Layouts & Nav`, `Assistant Chat Screen`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Expo Dependencies` to `Router Layouts & Nav`, `Package Manifest`, `Dependency: expo-constants`, `Dependency: expo-font`, `Dependency: @expo-google-fonts/dm-sans`, `Dependency: @expo-google-fonts/reddit-sans`, `Dependency: expo-linking`, `Dependency: expo-localization`, `Dependency: @expo/metro-runtime`, `Dependency: expo-router`, `Dependency: expo-speech`, `Dependency: expo-splash-screen`, `Dependency: expo-sqlite`, `Dependency: expo-status-bar`, `Dependency: @expo/vector-icons`, `Dependency: i18next`, `Dependency: react-dom`, `Dependency: react-i18next`, `Dependency: react-native`, `Dependency: react-native-reanimated`, `Dependency: react-native-safe-area-context`, `Dependency: react-native-screens`, `Dependency: react-native-url-polyfill`, `Dependency: react-native-web`, `Dependency: @supabase/supabase-js`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Why does `react` connect `Router Layouts & Nav` to `Admin & Utility Screens`, `Expo Dependencies`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **What connects `crypto`, `fs`, `path` to the rest of the system?**
  _168 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin & Utility Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.08239700374531835 - nodes in this community are weakly interconnected._
- **Should `Home & Service Detail UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07767722473604827 - nodes in this community are weakly interconnected._
- **Should `Vercel API Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.0963265306122449 - nodes in this community are weakly interconnected._