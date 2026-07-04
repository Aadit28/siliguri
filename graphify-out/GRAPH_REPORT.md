# Graph Report - c:/My projects Main/Silliguri New/siliguri  (2026-07-02)

## Corpus Check
- 66 files · ~115,638 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 957 nodes · 1404 edges · 70 communities (49 shown, 21 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.84)
- Token cost: 0 input · 510,741 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend App Core (screens, UI kit, contexts, lib)|Frontend App Core (screens, UI kit, contexts, lib)]]
- [[_COMMUNITY_Backend API Handlers (authcommunityassistant)|Backend API Handlers (auth/community/assistant)]]
- [[_COMMUNITY_English Home Screen Strings|English Home Screen Strings]]
- [[_COMMUNITY_Hindi Home Screen Strings|Hindi Home Screen Strings]]
- [[_COMMUNITY_English Assistant Strings|English Assistant Strings]]
- [[_COMMUNITY_Hindi Assistant Strings|Hindi Assistant Strings]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dev API & Backend Bridge|Dev API & Backend Bridge]]
- [[_COMMUNITY_Assistant Chat Screen Logic|Assistant Chat Screen Logic]]
- [[_COMMUNITY_Route-Screen Mapping (semantic)|Route-Screen Mapping (semantic)]]
- [[_COMMUNITY_English Services Strings|English Services Strings]]
- [[_COMMUNITY_Hindi Services Strings|Hindi Services Strings]]
- [[_COMMUNITY_Assistant Route Planning Logic|Assistant Route Planning Logic]]
- [[_COMMUNITY_Expo App Config|Expo App Config]]
- [[_COMMUNITY_App Providers & i18n Setup|App Providers & i18n Setup]]
- [[_COMMUNITY_Supabase Schema & Types|Supabase Schema & Types]]
- [[_COMMUNITY_English Common Strings|English Common Strings]]
- [[_COMMUNITY_Hindi Common Strings|Hindi Common Strings]]
- [[_COMMUNITY_Graphify Tool Artifact (noise)|Graphify Tool Artifact (noise)]]
- [[_COMMUNITY_English Community Strings|English Community Strings]]
- [[_COMMUNITY_Hindi Community Strings|Hindi Community Strings]]
- [[_COMMUNITY_English Help Strings|English Help Strings]]
- [[_COMMUNITY_Hindi Help Strings|Hindi Help Strings]]
- [[_COMMUNITY_Project Config & Docs|Project Config & Docs]]
- [[_COMMUNITY_English App Name & Post Categories|English App Name & Post Categories]]
- [[_COMMUNITY_English Assistant Capabilities Strings|English Assistant Capabilities Strings]]
- [[_COMMUNITY_Hindi Assistant Capabilities Strings|Hindi Assistant Capabilities Strings]]
- [[_COMMUNITY_English Auth Strings|English Auth Strings]]
- [[_COMMUNITY_Hindi Auth Strings|Hindi Auth Strings]]
- [[_COMMUNITY_Service Data Verification Pipeline|Service Data Verification Pipeline]]
- [[_COMMUNITY_English Intent Strings|English Intent Strings]]
- [[_COMMUNITY_English Category Strings|English Category Strings]]
- [[_COMMUNITY_Hindi Intent Strings|Hindi Intent Strings]]
- [[_COMMUNITY_Hindi Category Strings|Hindi Category Strings]]
- [[_COMMUNITY_Place Matching Helpers|Place Matching Helpers]]
- [[_COMMUNITY_English Tab Labels|English Tab Labels]]
- [[_COMMUNITY_Hindi Post Category Strings|Hindi Post Category Strings]]
- [[_COMMUNITY_Hindi Tab Labels|Hindi Tab Labels]]
- [[_COMMUNITY_English Assistant Status Strings|English Assistant Status Strings]]
- [[_COMMUNITY_Hindi App Name & Docs|Hindi App Name & Docs]]
- [[_COMMUNITY_Hindi Assistant Status Strings|Hindi Assistant Status Strings]]
- [[_COMMUNITY_DB Seed Script|DB Seed Script]]
- [[_COMMUNITY_Vercel Deploy Config|Vercel Deploy Config]]
- [[_COMMUNITY_English Example Labels|English Example Labels]]
- [[_COMMUNITY_English Example Prompts|English Example Prompts]]
- [[_COMMUNITY_Hindi Example Labels|Hindi Example Labels]]
- [[_COMMUNITY_Hindi Example Prompts|Hindi Example Prompts]]
- [[_COMMUNITY_Gemini Verify Script|Gemini Verify Script]]
- [[_COMMUNITY_Claude Plugin Settings|Claude Plugin Settings]]
- [[_COMMUNITY_Start Script|Start Script]]
- [[_COMMUNITY_Build Config Files|Build Config Files]]
- [[_COMMUNITY_DisplayTheme Providers|Display/Theme Providers]]
- [[_COMMUNITY_i18n & Locale Setup|i18n & Locale Setup]]
- [[_COMMUNITY_Saathi App Icon|Saathi App Icon]]
- [[_COMMUNITY_Animated Section Component|Animated Section Component]]
- [[_COMMUNITY_Shared Auth Library|Shared Auth Library]]
- [[_COMMUNITY_Helpline Config|Helpline Config]]
- [[_COMMUNITY_Theme Colors|Theme Colors]]
- [[_COMMUNITY_README Helpline Section|README Helpline Section]]
- [[_COMMUNITY_README App Overview|README App Overview]]
- [[_COMMUNITY_Saathi Hero Image|Saathi Hero Image]]
- [[_COMMUNITY_Supabase Config Flag|Supabase Config Flag]]
- [[_COMMUNITY_Theme Tap Constant|Theme Tap Constant]]
- [[_COMMUNITY_Theme Dark Colors|Theme Dark Colors]]
- [[_COMMUNITY_Theme Font|Theme Font]]
- [[_COMMUNITY_Theme Light Colors|Theme Light Colors]]
- [[_COMMUNITY_Theme Radius|Theme Radius]]
- [[_COMMUNITY_Theme Shadow|Theme Shadow]]
- [[_COMMUNITY_Theme Spacing|Theme Spacing]]

## God Nodes (most connected - your core abstractions)
1. `home` - 55 edges
2. `home` - 55 edges
3. `useTheme()` - 47 edges
4. `assistant` - 46 edges
5. `assistant` - 46 edges
6. `services` - 27 edges
7. `services` - 27 edges
8. `common` - 21 edges
9. `common` - 21 edges
10. `useAuth()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Services Directory feature` --shares_data_with--> `public.services table`  [INFERRED]
  README.md → supabase-schema.sql
- `Assistant Plan API Handler` --semantically_similar_to--> `Services Directory Screen`  [INFERRED] [semantically similar]
  api/assistant/plan.js → app/(tabs)/services.tsx
- `Help / SOS Screen` --semantically_similar_to--> `Assistant Plan API Handler`  [INFERRED] [semantically similar]
  app/(tabs)/help.tsx → api/assistant/plan.js
- `Project structure tree` --references--> `supabase-schema.sql (MVP schema)`  [EXTRACTED]
  README.md → supabase-schema.sql
- `Services Directory feature` --shares_data_with--> `public.favorites table`  [INFERRED]
  README.md → supabase-schema.sql

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Username/password auth session lifecycle (signup -> signin -> me -> signout)** — auth_lib_module, auth_signup_handler, auth_signin_handler, auth_me_handler, auth_signout_handler [INFERRED 0.85]
- **Expo Router bottom-tab navigation group** — tabs_layout_component, tabs_index_screen, tabs_services_screen, tabs_assistant_screen, tabs_community_screen, tabs_help_screen [EXTRACTED 1.00]
- **Auth-guarded community write endpoints (post/reply/like)** — auth_lib_authenticate, community_post_handler, community_reply_handler, community_like_handler [INFERRED 0.85]
- **Context Providers Composing App-Wide State** — authcontext_AuthProvider, displaymodecontext_DisplayModeProvider, localecontext_LocaleProvider, themecontext_AppThemeProvider [INFERRED 0.85]
- **Local Rule-Based Assistant Planning Pipeline** — assistant_buildLocalAssistantPlan, assistant_detectIntent, assistant_rankServices, assistant_extractRouteTimeRequest [EXTRACTED 1.00]
- **Saathi Local Dev API Request Flow** — devapi_server, devapi_routes, backend_backendRequest, api_createPost [INFERRED 0.85]
- **Saathi Supabase schema + migrations** — schema_file, authmigration_file, migration2_file [EXTRACTED 0.95]
- **Bilingual locale keys mirror TS category unions** — locales_en, locales_hi, types_ServiceCategory, types_PostCategory [INFERRED 0.80]
- **Project setup docs & Expo SDK version guidance** — agentsmd_ExpoVersionWarning, claudemd_config, readme_GettingStarted, startps1_script [INFERRED 0.85]

## Communities (70 total, 21 thin omitted)

### Community 0 - "Frontend App Core (screens, UI kit, contexts, lib)"
Cohesion: 0.05
Nodes (92): RootStack(), Login(), makeStyles(), makeStyles(), NewPost(), AppHeader Component, AppHeader(), styles (+84 more)

### Community 1 - "Backend API Handlers (auth/community/assistant)"
Cohesion: 0.06
Nodes (56): buildDirectionsUrl(), buildLocalAssistantPlan(), buildRouteTimePlan(), CATEGORY_KEYWORDS, categoryForIntent(), cleanRoutePlace(), COPY, detectIntent() (+48 more)

### Community 2 - "English Home Screen Strings"
Cohesion: 0.04
Nodes (55): home, browseCategories, elderBody, elderCta, elderTitle, greeting, heroBody, heroKicker (+47 more)

### Community 3 - "Hindi Home Screen Strings"
Cohesion: 0.04
Nodes (55): home, browseCategories, elderBody, elderCta, elderTitle, greeting, heroBody, heroKicker (+47 more)

### Community 4 - "English Assistant Strings"
Cohesion: 0.05
Nodes (41): assistant, agentSignal, aiBacked, attachImage, botStatus, botTitle, chatHistory, chatPlaceholder (+33 more)

### Community 5 - "Hindi Assistant Strings"
Cohesion: 0.05
Nodes (41): assistant, agentSignal, aiBacked, attachImage, botStatus, botTitle, chatHistory, chatPlaceholder (+33 more)

### Community 6 - "Package Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, expo, expo-blur, expo-constants, expo-linking, expo-localization, @expo/metro-runtime, expo-router (+30 more)

### Community 7 - "Dev API & Backend Bridge"
Cohesion: 0.08
Nodes (31): Assistant Plan Handler, Auth Me Handler, Auth Signin Handler, Auth Signout Handler, Auth Signup Handler, Community Like Handler, Community Post Handler, Community Reply Handler (+23 more)

### Community 8 - "Assistant Chat Screen Logic"
Cohesion: 0.10
Nodes (22): AssistantAction, AssistantAttachment, AssistantMessage, AssistantPlan, AssistantScreen(), ChatSession, ChatState, ComposerKeyPressEvent (+14 more)

### Community 9 - "Route-Screen Mapping (semantic)"
Cohesion: 0.13
Nodes (27): Expo App Manifest (Saathi), buildLocalAssistantPlan() - rule-based fallback planner, Assistant Plan API Handler, normalizeOpenAIPlan() - validates/shapes LLM output, planWithOpenAI() - LLM-backed planner, adminClient() - Supabase service-role client, authenticate() - bearer token session lookup, createSession() - issues auth token (+19 more)

### Community 10 - "English Services Strings"
Cohesion: 0.07
Nodes (27): services, about, addFavorite, callFirst, careNote, contactActions, directoryBody, directoryKicker (+19 more)

### Community 11 - "Hindi Services Strings"
Cohesion: 0.07
Nodes (27): services, about, addFavorite, callFirst, careNote, contactActions, directoryBody, directoryKicker (+19 more)

### Community 12 - "Assistant Route Planning Logic"
Cohesion: 0.11
Nodes (23): AssistantActionKind, AssistantIntent, AssistantLang, AssistantStatus, buildDirectionsUrl(), buildLocalAssistantPlan(), buildRouteTimePlan(), CATEGORY_KEYWORDS (+15 more)

### Community 13 - "Expo App Config"
Cohesion: 0.08
Nodes (23): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, expo, android (+15 more)

### Community 14 - "App Providers & i18n Setup"
Cohesion: 0.10
Nodes (15): styles, AuthContext, AuthProvider(), AuthState, SaathiSession, SaathiUser, DisplayMode, DisplayModeContext (+7 more)

### Community 15 - "Supabase Schema & Types"
Cohesion: 0.14
Nodes (20): supabase-migration-2.sql (elder_home + source_url), Backend setup (Supabase) instructions, Community Connect feature, Saathi Assistant feature, Security note (.env / service_role key), Services Directory feature, public.auth_tokens table, public.community_posts table (+12 more)

### Community 16 - "English Common Strings"
Cohesion: 0.10
Nodes (21): common, all, back, call, cancel, directions, errorLoading, loading (+13 more)

### Community 17 - "Hindi Common Strings"
Cohesion: 0.10
Nodes (21): common, all, back, call, cancel, directions, errorLoading, loading (+13 more)

### Community 18 - "Graphify Tool Artifact (noise)"
Cohesion: 0.14
Nodes (13): files, code, document, image, paper, video, graphifyignore_patterns, needs_graph (+5 more)

### Community 19 - "English Community Strings"
Cohesion: 0.14
Nodes (14): community, askQuestion, likes, newPost, noReplies, postBody, postCategory, posted (+6 more)

### Community 20 - "Hindi Community Strings"
Cohesion: 0.14
Nodes (14): community, askQuestion, likes, newPost, noReplies, postBody, postCategory, posted (+6 more)

### Community 21 - "English Help Strings"
Cohesion: 0.17
Nodes (12): help, callNow, describeIssue, emergency, languages, requestCallback, submit, submitted (+4 more)

### Community 22 - "Hindi Help Strings"
Cohesion: 0.17
Nodes (12): help, callNow, describeIssue, emergency, languages, requestCallback, submit, submitted (+4 more)

### Community 23 - "Project Config & Docs"
Cohesion: 0.20
Nodes (9): Expo SDK v56 versioned-docs warning, CLAUDE.md (project instructions), Getting started instructions, start.ps1 launcher, compilerOptions, strict, exclude, extends (+1 more)

### Community 24 - "English App Name & Post Categories"
Cohesion: 0.20
Nodes (9): appName, postCategories, best_practice, daily_life, general, health, travel, tagline (+1 more)

### Community 25 - "English Assistant Capabilities Strings"
Cohesion: 0.20
Nodes (10): capabilities, context, handoff, tools, body, label, body, label (+2 more)

### Community 26 - "Hindi Assistant Capabilities Strings"
Cohesion: 0.20
Nodes (10): capabilities, context, handoff, tools, body, label, body, label (+2 more)

### Community 27 - "English Auth Strings"
Cohesion: 0.25
Nodes (8): auth, createAccount, createAccountOnly, fullName, haveAccount, needAccount, signInOnly, welcome

### Community 28 - "Hindi Auth Strings"
Cohesion: 0.25
Nodes (8): auth, createAccount, createAccountOnly, fullName, haveAccount, needAccount, signInOnly, welcome

### Community 29 - "Service Data Verification Pipeline"
Cohesion: 0.33
Nodes (7): Service/Post Category Registry, call() — Gemini API Request, Gemini Place Verification Script, detectIntent(), matchesAny(), Supabase Seed Script (main), Service Directory Seed Data

### Community 30 - "English Intent Strings"
Cohesion: 0.29
Nodes (7): intent, daily_help, elder_care, general, medical_appointment, medicine_delivery, transport

### Community 31 - "English Category Strings"
Cohesion: 0.29
Nodes (7): categories, daily_service, doctor, elder_home, hospital, medical_shop, travel_agent

### Community 32 - "Hindi Intent Strings"
Cohesion: 0.29
Nodes (7): intent, daily_help, elder_care, general, medical_appointment, medicine_delivery, transport

### Community 33 - "Hindi Category Strings"
Cohesion: 0.29
Nodes (7): categories, daily_service, doctor, elder_home, hospital, medical_shop, travel_agent

### Community 34 - "Place Matching Helpers"
Cohesion: 0.33
Nodes (6): editDistance(), estimateRouteTime(), matchKnownPlaceAlias(), normalizePlace(), placeMatchScore(), tokenizePlace()

### Community 35 - "English Tab Labels"
Cohesion: 0.33
Nodes (6): tabs, assistant, community, help, home, services

### Community 36 - "Hindi Post Category Strings"
Cohesion: 0.33
Nodes (6): postCategories, best_practice, daily_life, general, health, travel

### Community 37 - "Hindi Tab Labels"
Cohesion: 0.33
Nodes (6): tabs, assistant, community, help, home, services

### Community 38 - "English Assistant Status Strings"
Cohesion: 0.40
Nodes (5): status, handoff, needs_details, ready_to_call, urgent

### Community 39 - "Hindi App Name & Docs"
Cohesion: 0.40
Nodes (4): appName, tagline, Bilingual (Hindi/English) feature, Project structure tree

### Community 40 - "Hindi Assistant Status Strings"
Cohesion: 0.40
Nodes (5): status, handoff, needs_details, ready_to_call, urgent

### Community 41 - "DB Seed Script"
Cohesion: 0.40
Nodes (3): posts, services, supabase

### Community 42 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, outputDirectory, rewrites, $schema

### Community 43 - "English Example Labels"
Cohesion: 0.50
Nodes (4): exampleLabels, doctor, medicine, travel

### Community 44 - "English Example Prompts"
Cohesion: 0.50
Nodes (4): examples, doctor, medicine, travel

### Community 45 - "Hindi Example Labels"
Cohesion: 0.50
Nodes (4): exampleLabels, doctor, medicine, travel

### Community 46 - "Hindi Example Prompts"
Cohesion: 0.50
Nodes (4): examples, doctor, medicine, travel

### Community 47 - "Gemini Verify Script"
Cohesion: 0.67
Nodes (3): body, call(), main()

## Knowledge Gaps
- **608 isolated node(s):** `expo@claude-plugins-official`, `code`, `document`, `paper`, `image` (+603 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `assistant` connect `English Assistant Strings` to `English Assistant Status Strings`, `English Example Labels`, `English Example Prompts`, `English App Name & Post Categories`, `English Assistant Capabilities Strings`, `English Intent Strings`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `assistant` connect `Hindi Assistant Strings` to `Hindi Intent Strings`, `Hindi App Name & Docs`, `Hindi Assistant Status Strings`, `Hindi Example Labels`, `Hindi Example Prompts`, `Hindi Assistant Capabilities Strings`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `home` connect `English Home Screen Strings` to `English App Name & Post Categories`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `expo@claude-plugins-official`, `code`, `document` to the rest of the system?**
  _609 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend App Core (screens, UI kit, contexts, lib)` be split into smaller, more focused modules?**
  _Cohesion score 0.05196078431372549 - nodes in this community are weakly interconnected._
- **Should `Backend API Handlers (auth/community/assistant)` be split into smaller, more focused modules?**
  _Cohesion score 0.05835010060362173 - nodes in this community are weakly interconnected._
- **Should `English Home Screen Strings` be split into smaller, more focused modules?**
  _Cohesion score 0.03636363636363636 - nodes in this community are weakly interconnected._