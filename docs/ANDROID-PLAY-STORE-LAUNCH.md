# StatsAI — Google Play (Android) Launch Plan

**Goal:** Ship the existing Expo/React Native app to Google Play with feature parity to iOS (stats, guest mode, email + Google Sign-In, push), reusing the same codebase.

**Decisions:** New Google Play account · **full parity v1** (Google Sign-In + FCM push) · bundle/package `il.statsai.app`.

> Most of the app is already cross-platform. The work below is Android-specific plumbing + Play Console setup. The team-logo→initials-badge change (SHOW_TEAM_LOGOS=false), RTL, guest mode, and account deletion all carry over from the shared code.

Legend: 🧑 = you (account/console/EAS login) · 🤖 = me (code/config) · ⏳ = long-pole / starts early.

---

## Phase A — Accounts & foundations (start now, mostly 🧑)

- [ ] **A1. 🧑⏳ Register Google Play Developer account** — $25 one-time at play.google.com/console. Identity verification can take a few days.
  - **Personal account** → subject to the **closed-test gate**: ≥12 testers opted in for **14 continuous days** before Production is unlocked. Start recruiting testers now.
  - **Organization account** → exempt from the 14-day gate, but verification needs a D-U-N-S number (can take 1–2 weeks). Choose based on whether you have a business entity + timeline.
- [ ] **A2. 🧑 Create the app in Play Console** — App (not game), default language **Hebrew**, Free, category **Sports**.
- [ ] **A3. 🧑 Firebase project for FCM** — create (or reuse the existing "StatsAI" Google Cloud project), add an **Android app** with package `il.statsai.app`, download `google-services.json`. (Needed for push.)
- [ ] **A4. 🧑⏳ Recruit 12 Android testers** (only if personal account) — friends/colleagues with Google accounts for the 14-day closed test.

## Phase B — Build config (🤖 code, then 🧑 EAS)

- [ ] **B1. 🤖 `eas.json`** — confirm the `production` profile builds an **.aab** (EAS default) and add Android `autoIncrement` (versionCode). Keep the existing env (API URL + Google client IDs).
- [ ] **B2. 🤖 `app.json`** — add `expo.android.googleServicesFile: "./google-services.json"`; confirm `package`, `adaptiveIcon`, and notification config. Add `POST_NOTIFICATIONS` is handled automatically by expo-notifications (Android 13+).
- [ ] **B3. 🧑 `eas credentials` (Android)** — let EAS generate the **upload keystore**. Record the **SHA-1** (needed for Google Sign-In). Note: after the first Play upload, **Play App Signing** re-signs with a *different* key — its SHA-1 must ALSO be registered (see C2).

## Phase C — Google Sign-In on Android (🧑 console + 🤖 verify)

- [ ] **C1. 🧑 Create an Android OAuth client** in Google Cloud → Credentials → OAuth client ID → **Android** → package `il.statsai.app` + the **upload-key SHA-1** from B3.
- [ ] **C2. 🧑 Add the Play App Signing SHA-1** — after the first .aab is uploaded, copy the **App signing key** SHA-1 from Play Console → Setup → App signing, and add it as a *second* Android OAuth client (same package). **This is the #1 reason Google Sign-In fails on Android** — without the Play-signing SHA-1, sign-in breaks for installs from the Play Store.
- [ ] **C3. 🤖 Verify code** — `mobile/lib/googleAuth.ts` already uses `webClientId` for the idToken audience (which the backend accepts). Android needs the OAuth clients above to *exist* for the SHA-1 match; no separate Android client ID is passed in code. Confirm the Google button renders on Android (it's currently shown on all platforms).

## Phase D — Push via FCM (🧑 + 🤖)

- [ ] **D1. 🧑 Upload FCM credentials to EAS** — `eas credentials` → Android → **FCM V1** → upload the Firebase **service-account JSON** (from Firebase project settings → Service accounts).
- [ ] **D2. 🤖 Confirm app config** — `google-services.json` referenced in app.json (B2); `mobile/lib/push.ts` already creates the Android notification channel (`setNotificationChannelAsync('default')`) and gates on `Device.isDevice`. ✓
- [ ] **D3. 🤖 Backend — already ready.** `PushToken.platform` supports `'android'`; the mobile client registers with `platform: Platform.OS`; Expo relays to FCM. No backend change needed.
- [ ] **D4. 🧑 Test push on a real Android device** (FCM doesn't work on emulators without Play services image) — token registers → `node scripts/send-test-push.js`.

## Phase E — Store assets & listing (🤖 drafts + 🧑 upload)

- [ ] **E1. 🤖 App icon 512×512** (from the existing icon) + **🧑/🤖 Feature graphic 1024×500 (REQUIRED)** — needs a simple branded banner.
- [ ] **E2. 🤖 Phone screenshots** — capture the badge screens from an Android emulator (home, standings, top-scorers, player, team). Play accepts 16:9 / 9:16, 320–3840px.
- [ ] **E3. 🧑 Listing copy** — reuse the **trademark-free** Hebrew title (≤30) / short desc (≤80) / full desc (≤4000). Same no-logos / factual-data discipline as iOS (Google's impersonation policy is similar).
- [ ] **E4. 🧑 Data safety form** — mirror iOS App Privacy: Email + Name + User ID, linked to identity, **no tracking**, purpose = app functionality.
- [ ] **E5. 🧑 Content rating** (IARC questionnaire) → Sports, ~Everyone.
- [ ] **E6. 🧑 App content** — Privacy policy URL (`https://statsai.co.il/privacy` ✓), **account-deletion URL** (`https://statsai.co.il/account` ✓ — Google requires an off-app deletion path), ads = No, target audience = 13+ (avoid Families policy).

## Phase F — Build, test, release (🧑 EAS + Console)

- [ ] **F1. 🧑 Build** — `cd mobile && eas build --profile production --platform android` → .aab.
- [ ] **F2. 🧑 Submit** — `eas submit --platform android` (needs a Google Play **service-account JSON** with API access, configured once in `eas.json` submit profile) — or upload the .aab manually for the first release.
- [ ] **F3. 🧑 Internal testing** — install on an Android device; verify: **RTL layout**, initials badges (no logos), Google Sign-In, push, guest mode, account deletion, live = Israel-only.
- [ ] **F4. 🧑⏳ Closed testing (personal accounts only)** — 12 testers, **14 continuous days**.
- [ ] **F5. 🧑 Production release.**

---

## Cross-cutting notes / risks
- **Long-poles:** account verification (A1), the 14-day/12-tester closed test (A4/F4, personal accounts), and the Google Sign-In Play-signing SHA-1 (C2). Start A1/A3/A4 immediately.
- **Copycat:** the iOS lesson applies — logos are hidden via `SHOW_TEAM_LOGOS=false` (Android inherits), keep team names factual, non-affiliation note in the description.
- **RTL on Android:** Android handles RTL slightly differently than iOS; re-verify the screens we fixed (side menu, home, standings) on a real Android device during F3.
- **No new backend work** — the API, auth (shared Session table), and push backend are platform-agnostic and already deployed.

## What I (🤖) can do now while you set up the account
- B1 (eas.json android), B2 (app.json google-services reference + android tweaks).
- E1/E2 (icon 512, Android screenshots from an emulator), draft a feature-graphic concept.
- Pre-write the listing copy + data-safety answers.

---

## ✅ Done (2026-07-01)
- **Logos: platform-gated.** `mobile/lib/teamBadge.ts` → `SHOW_TEAM_LOGOS = Platform.OS === 'android'`. Android shows **real club crests**; iOS keeps initials badges (protects the App Store approval on future updates).
- **`app.json`** → added `android.googleServicesFile: "./google-services.json"` (needed for Android push + Google Sign-In). ⚠️ Android `eas build` will fail until you drop the real `google-services.json` from Firebase into `mobile/`. iOS builds are unaffected.
- **Play icon** → `mobile/store-android/play-icon-512.png` (512×512).
- Typecheck clean; committed locally (push pending the GitHub-auth fix).

## Ready-to-paste Play listing content (Hebrew)

**App name (≤30):**
```
StatsAI — כדורגל ישראלי
```

**Short description (≤80):**
```
סטטיסטיקה, טבלאות, תוצאות חיות וחדשות מהכדורגל הישראלי — בעברית ובחינם.
```

**Full description (≤4000):**
```
StatsAI — כל הסטטיסטיקה של הכדורגל הישראלי במקום אחד.

טבלאות ליגה לאורך 26 עונות, סטטיסטיקות שחקנים מלאות, מלכי שערים ובישולים,
תוצאות חיות, חדשות, תחזיות משחק וקריירות שחקנים — בממשק עברי מהיר ונקי.

• טבלאות הליגות הבכירות בישראל, עם היסטוריה מלאה והחלפת עונה
• דפי שחקנים: סטטיסטיקה עונתית, קריירה, גרפים והישגים
• דפי קבוצות: סגל, משחקים, מאמנים ומגמות
• מלכי שערים, בישולים, כרטיסים — 6 קטגוריות
• תוצאות חיות והתראות לקבוצה שאתה עוקב אחריה
• עוזר סטטיסטיקות חכם (AI) לשאלות על שחקנים, קבוצות ומשחקים
• חדשות ועדכונים בזמן אמת
• תחזיות ואחוזי ניצחון למשחקים הקרובים

המידע הוא נתונים סטטיסטיים עובדתיים הנאספים ממקורות ציבוריים ומתעדכן באופן שוטף.
StatsAI היא אפליקציית סטטיסטיקה עצמאית ואינה מזוהה עם, ממומנת על ידי, או מאושרת
על ידי אף קבוצה, ליגה או גוף ספורט כלשהו.
```

## Data safety form (Google Play answers)
- **Does the app collect/share user data?** Yes (collects; does **not** share with third parties).
- **Data types collected:** Personal info → **Email address**, **Name**, **User IDs**.
- **Linked to the user's identity:** Yes.
- **Purpose:** **App functionality** (account) only.
- **Used for tracking / advertising:** **No**.
- **Encrypted in transit:** Yes.
- **Users can request data deletion:** Yes — in-app (Preferences → delete account) **and** web at `https://statsai.co.il/account`.
- Guests: no personal data collected until registration.

## Content rating (IARC questionnaire)
- Category: **Reference / Sports** app; no violence, sexual, gambling (odds shown are informational, not real-money), or user-generated content. → expected **Everyone / PEGI 3**.

## App content declarations
- Privacy policy: `https://statsai.co.il/privacy`
- Account deletion URL: `https://statsai.co.il/account`
- Ads: **No**
- Target audience: **13+** (not directed at children — avoids Families policy)
