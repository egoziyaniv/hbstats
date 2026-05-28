# HBStats — TODO

רשימת רעיונות, פיצ'רים ובעיות לטיפול בהמשך. סדר עדיפויות גמיש — מטפלים תוך-כדי-תנועה כשיש זמן/הקשר מתאים.

## ⚙️ פעיל
- [x] **Mobile #1+#2+#3+#4** — כל 4 ה-ports נבנו ב-v0.8.9, build חדש ל-iOS + Android בתהליך
- [ ] **App Store Connect record (אתה בדפדפן):**
  1. https://appstoreconnect.apple.com/apps → "+" → New App
  2. Platforms: iOS · Name: HBStats · Primary language: Hebrew (or English)
  3. Bundle ID: `il.hbstats.app` (כבר רשום ב-Apple Developer)
  4. SKU: `hbstats-001` (כל ערך ייחודי)
  5. אחרי יצירה — שלח לי את ה-**App Apple ID** (מספר 10 ספרות בכותרת הרשומה)
  6. אני אעדכן `mobile/eas.json` (ascAppId) → אריץ `eas build --profile production` → `eas submit --platform ios`
- [ ] **Google Play Console record (אתה בדפדפן):**
  1. https://play.google.com/console → Create app
  2. App name: HBStats · Language: עברית · Category: Sports · Free
  3. Setup → API access → Create service account → Download JSON key → תשלח אלי
  4. אני אעדכן את eas.json submit profile + `eas submit --platform android`

## 💡 רעיונות לעתיד
- [ ] **Heatmap מיקומי שחקנים** במשחק — דרך Sofascore scraper. הם משתמשים ב-Opta tracking. ה-API פנימי שלהם מחזיר JSON עם `heatmap: [{x, y}]`. דורש להתמודד עם Cloudflare + headers (יש לנו תשתית puppeteer-real-browser). מומלץ לסרוק רק ~1000-2000 משחקים עדכניים (2024+) — לא להיסטוריה.
- [ ] **OTA updates למובייל** דרך `expo-updates` — כדי לא להריץ EAS build על כל שינוי JS קטן.
- [ ] **Player trophies בדף שחקן** — יש לנו 9,126 רשומות `PlayerTrophy` שלא מוצגות בצורה ייעודית.
- [ ] **Coach profile page** — דף לכל מאמן עם הקריירה שלו (נתונים יש דרך `TeamCoachAssignment`).
- [ ] **Compare players** — השוואה side-by-side של 2 שחקנים על stats מתקדמים (מסירות מפתח, דו-קרבות, דריבלים, xG, xA).
- [ ] **Filter advanced leaderboards by position** — להציג top key passes רק לקשרים, top duels רק לבלמים, וכו'.
- [ ] **TestFlight beta testers** — אחרי שיש production iOS build, להוסיף testers.
- [ ] **App Store screenshots + description** — צריך 6.7" + 5.5" screenshots, תיאור באנגלית ועברית, keywords.

## 🐛 בעיות ידועות
- [ ] **API-Football coverage** — חלק מהמשחקים מחזירים פחות שחקנים מ-22 בקריאה (חוסר כיסוי). אין מה לעשות מצד שלנו.
- [ ] **Flashscore stats=0 למשחקי גביע** — Flashscore לא מספק xG ל-state-cup/toto-cup. גם זה מגבלת מקור.
- [ ] **שמות עונות לא אחידים ב-DB:** `2025/26` (קצר), `2014/2015` (לוכסן), `2000-2001` (מקף) — לפי המקור שהביא. אם נרצה אחידות, צריך migration.

## ✅ הושלם (היסטוריה קצרה)
- v0.8.7 — לינק "מתקדם" בתפריט + פירוט פר-משחק ב-leaderboards + dedup מאמנים
- v0.8.6 — popup פר-שחקן: שם בעברית + accent color + תמונה
- v0.8.5 — popup דרך React Portal (תיקון מיקום)
- v0.8.4 — `/statistics/advanced` עם 3 leaderboards
- v0.8.3 — דף קבוצה: מאמנים + פציעות
- v0.8.2 — דף שחקן: היסטוריית הופעות עם גרף
- v0.8.1 — popup פר-שחקן בדף משחק
- v0.8.0 — schema `GamePlayerStats` + import מ-API-Football
- v0.7.4 — טאב חוזים בדף קבוצה
- v0.7.3 — תיקון venue apiFootballId=0 collision
- v0.7.2 — תיקון chatbot dedup + double-yellow data
- v0.7.1 — תוצאה טכנית (awarded badge)
- v0.7.0 — Mobile season picker + endpoints
- ייבוא היסטוריה: 2000-2025 דרך Flashscore + IFA + RSSSF + Walla
