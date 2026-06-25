# StatsAI — מדריך הגשה ל-App Store (iOS)

מדריך צעד-אחר-צעד להגשת אפליקציית StatsAI ל-App Store. מסומן מה כבר מוכן (✅),
מה אתה צריך לעשות ידנית (🧑), ומה אני יכול להכין/הכנתי (🤖).

> Bundle ID: `il.statsai.app` · EAS projectId: `d47a7eca-da88-4598-b14a-49cdc48ea340` · API: `https://statsai.co.il`

---

## 0. מצב נוכחי (מה כבר מוכן) ✅
- מחיקת חשבון בתוך האפליקציה (דרישת אפל 5.1.1(v))
- מצב אורח (התחברות אופציונלית) — מאפשר לבודקי אפל לגלוש בלי חשבון
- אייקון 1024×1024 ללא שקיפות
- דף מדיניות פרטיות חי: https://statsai.co.il/privacy
- Privacy manifest + הצהרת הצפנה (`ITSAppUsesNonExemptEncryption: false`)
- גרסה 1.0.0, API מצביע ל-statsai.co.il
- פרופיל `production` ב-eas.json
- Push notifications מוכן (צריך רק מפתח APNs — שלב 2)

---

## 1. App Store Connect — יצירת האפליקציה 🧑
1. היכנס ל-https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**.
2. מלא:
   - **Platform:** iOS
   - **Name:** StatsAI (אם תפוס — נסה "StatsAI — כדורגל ישראלי")
   - **Primary Language:** Hebrew
   - **Bundle ID:** `il.statsai.app` (אם לא מופיע — צור אותו ב-Apple Developer → Identifiers, עם יכולת Push Notifications מסומנת)
   - **SKU:** `statsai-ios` (מזהה פנימי חופשי)
3. שמור.

## 2. מפתח APNs (ל-Push) 🧑 — חד-פעמי
```bash
cd mobile
eas credentials
# בחר: iOS → (פרופיל production) → Push Notifications Key → Set up a new key
```
Expo ייצור ויעלה את ה-.p8 אוטומטית לחשבון Apple שלך. זה כל מה שצריך כדי
שה-push (גולים/תוצאות שכבר בנינו) יעבדו בייצור.

## 2.5 ⚠️ Google Sign-In — לקוח iOS חדש ל-bundle החדש 🧑
ה-bundle שונה ל-`il.statsai.app`, אז לקוח ה-OAuth של גוגל לאייפון (שהיה רשום ל-bundle הישן) כבר לא תואם — **התחברות גוגל באייפון תיכשל עד שתעשה את זה:**
1. https://console.cloud.google.com → APIs & Services → **Credentials**.
2. **+ Create Credentials → OAuth client ID → Application type: iOS**.
3. **Bundle ID:** `il.statsai.app`. שמור.
4. העתק את ה-**iOS URL scheme** (ה-"reversed client ID", נראה כמו `com.googleusercontent.apps.XXXX-YYYY`).
5. שלח לי אותו — אעדכן את `iosUrlScheme` ב-app.json. (בלי זה: מצב אורח + email/סיסמה עובדים, רק כפתור גוגל באייפון לא.)

## 3. בנייה והעלאה 🧑
```bash
cd mobile
# מומלץ קודם build ל-TestFlight כדי לבדוק push על מכשיר אמיתי:
eas build --profile production --platform ios
eas submit --platform ios --latest        # מעלה ל-App Store Connect
```
- הבנייה רצה בענן (~10–20 דק'). `eas submit` מעלה ישירות ל-ASC.
- אחרי ההעלאה: ASC → TestFlight → התקן על האייפון → בדוק push (`node scripts/send-test-push.js`).

## 4. מטא-דאטה (App Information + עמוד הגרסה) 🤖 טיוטות מוכנות למטה
- **קטגוריה:** Sports (ראשית). משנית: News (אופציונלי).
- **תיאור / מילות מפתח / subtitle:** ראה סעיף "תוכן מוכן" למטה.
- **Support URL:** https://statsai.co.il  (או דף תמיכה ייעודי)
- **Marketing URL:** https://statsai.co.il (אופציונלי)
- **Privacy Policy URL:** https://statsai.co.il/privacy ✅

## 5. שאלון App Privacy 🤖 התשובות מוכנות למטה
ב-ASC → App Privacy → "Get Started". מלא לפי הטבלה ב"תוכן מוכן".

## 6. צילומי מסך 🤖 אני יכול לייצר מהסימולטור
חובה: לפחות גודל **iPhone 6.7"** (1290×2796). מומלץ 4–6 מסכים.
מסכים מומלצים (עם נתוני 2025/26 שעכשיו מוצגים כברירת מחדל):
1. דף בית — טבלה + המשחק הבא (אלוף האלופים)
2. טבלת ליגת העל מלאה
3. שחקנים / מלכי שערים
4. דף שחקן (קריירה + סטטיסטיקה)
5. דף קבוצה
6. חדשות / לייב
> אני יכול לצלם אותם מהסימולטור ולחתוך לגדלים הנכונים — בקש ממני.

## 7. App Preview (סרטון) — אופציונלי 🤖 תסריט מוכן
אפל לא מחייבת סרטון. אם רוצים, סרטון 15–30 שניות. תסריט מוצע:
1. (0-3ש') פתיחה על דף הבית — טבלה נגללת.
2. (3-8ש') מעבר לדף שחקן — סטטיסטיקה + גרפים.
3. (8-14ש') טבלת ליגה + החלפת עונה (SeasonChip).
4. (14-20ש') לייב / התראת גול (אפשר להדגים עם push).
5. (20-25ש') חדשות + לוגו StatsAI.
> אקליט/אערוך? לא יכול להפיק וידאו, אבל אפשר שאצלם את כל הפריימים/מסכים ואתה תרכיב, או נשתמש ב-`xcrun simctl` להקלטת מסך של הסימולטור (`xcrun simctl io booted recordVideo`).

## 8. הערות לבודק (App Review Notes) 🤖 מוכן למטה
ב-ASC → Version → "App Review Information".

## 9. צ'קליסט לפני "Submit for Review"
- [ ] אפליקציה נוצרה ב-ASC עם bundle `il.statsai.app`
- [ ] מפתח APNs הוגדר (`eas credentials`)
- [ ] build הועלה דרך `eas submit` ונבחר לגרסה
- [ ] צילומי מסך 6.7" הועלו
- [ ] תיאור + מילות מפתח + subtitle
- [ ] Support URL + Privacy Policy URL
- [ ] שאלון App Privacy מולא
- [ ] App Review Notes (כולל הסבר על מצב אורח)
- [ ] Age Rating מולא (כדורגל/חדשות → בד"כ 4+)
- [ ] בדיקת push ב-TestFlight עברה
- [ ] Submit for Review

---

# תוכן מוכן (העתק-הדבק)

## Subtitle (30 תווים)
> סטטיסטיקה שמנצחת את המשחק

## תיאור (Description — עברית) — מתוקן ל-4.1(a): ללא שמות קבוצות/ליגה מסחריים + הצהרת אי-שיוך
```
StatsAI — כל הסטטיסטיקה של הכדורגל הישראלי במקום אחד.

טבלאות ליגה לאורך 26 עונות, סטטיסטיקות שחקנים מלאות, מלכי שערים ובישולים,
תוצאות חיות, חדשות, תחזיות משחק, וקריירות שחקנים — בממשק עברי מהיר ונקי.

• טבלאות הליגות הבכירות בישראל, עם היסטוריה מלאה והחלפת עונה
• דפי שחקנים: סטטיסטיקה עונתית, קריירה, גרפים והישגים
• דפי קבוצות: סגל, משחקים, מאמנים ומגמות
• מלכי שערים, בישולים, כרטיסים — 6 קטגוריות
• תוצאות חיות והתראות לקבוצה שאתה עוקב אחריה
• חדשות ועדכונים בזמן אמת
• תחזיות ואחוזי ניצחון למשחקים הקרובים

המידע הוא נתונים סטטיסטיים עובדתיים הנאספים ממקורות ציבוריים ומתעדכן באופן שוטף.
StatsAI היא אפליקציית סטטיסטיקה עצמאית, ואינה מזוהה עם, ממומנת על ידי, או מאושרת
על ידי אף קבוצה, ליגה או גוף ספורט כלשהו.
```

## מילות מפתח (Keywords — עד 100 תווים) — מתוקן: הוסרו מכבי/הפועל/בית"ר/ליגת העל
```
כדורגל,סטטיסטיקה,טבלה,ליגה,שחקנים,מלך שערים,בישולים,תוצאות,ספורט,ישראל,עונה,קריירה
```

## שאלון App Privacy — תשובות
על בסיס מה שהאפליקציה אוספת (זהה ל-Privacy Manifest שב-app.json):

| נתון | נאסף? | מקושר לזהות? | מטרה | Tracking? |
|---|---|---|---|---|
| Email Address | כן (בהרשמה) | כן | App Functionality (חשבון) | לא |
| Name | כן (בהרשמה) | כן | App Functionality | לא |
| User ID | כן | כן | App Functionality | לא |
| כל השאר (מיקום/אנשי קשר/בריאות/פיננסים/גלישה) | **לא** | — | — | — |

- **Tracking (מעקב חוצה-אפליקציות):** **No** (אין ATT, אין מעקב).
- אורחים: לא נאסף כלום עד הרשמה.

## App Review Notes (הערות לבודק)
```
The app opens directly to public content — login is OPTIONAL (guest mode), so
no account is required to review the app. To test the logged-in experience you
may use Sign in with Apple, Sign in with Google, or register with email + password.
Account deletion is available in the Preferences screen.

Data is publicly available Israeli football statistics. Hebrew/RTL UI.
Push notifications deliver goal/result alerts for a team the user follows.
StatsAI is an independent statistics app, not affiliated with any team or league.
```

## תשובה ל-App Review (להדביק כ-Reply ב-ASC, מול הדחייה) — מטפל בשני הסעיפים
```
Hello, thank you for the review. We have addressed both items in this new build:

Guideline 4.8 (Login Services):
We added "Sign in with Apple" as an equivalent login option, presented alongside
Sign in with Google and email/password on the login screen. Sign in with Apple
limits data collection to name and email, lets the user keep their email private
(Hide My Email), and we do not track users or collect interactions for advertising.

Guideline 4.1(a) (Copycats):
StatsAI is an independent app that presents publicly available, factual football
statistics (standings, player stats, results). We are not affiliated with, endorsed
by, or sponsored by any team, league, or sports organization. We have removed
third-party team and league names from the app metadata (keywords and description)
and added an explicit non-affiliation statement to the description.

Please let us know if any further changes are needed. Thank you!
```

## Age Rating
- בד"כ **4+** (תוכן ספורט/חדשות, ללא תוכן בעייתי). ענה "None" לרוב הקטגוריות בשאלון ה-Age Rating.
