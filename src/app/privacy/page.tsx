export const metadata = {
  title: 'מדיניות פרטיות',
  description: 'מדיניות הפרטיות של StatsAI — אפליקציית סטטיסטיקות כדורגל ישראלי.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-16" dir="rtl">
      <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-stone-900">מדיניות פרטיות</h1>
        <p className="mt-1 text-sm text-stone-500">עודכן לאחרונה: מאי 2026</p>

        <div className="mt-6 space-y-6 text-sm leading-7 text-stone-700">
          <section>
            <h2 className="text-lg font-black text-stone-900">מי אנחנו</h2>
            <p>
              StatsAI (להלן: &quot;השירות&quot;, &quot;אנחנו&quot;) מספק נתוני סטטיסטיקה של כדורגל
              ישראלי דרך אתר אינטרנט ואפליקציית מובייל ל-iOS. השירות מתופעל על-ידי יבגני אגוזי.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">איזה מידע אנחנו אוספים</h2>
            <ul className="list-inside list-disc space-y-2">
              <li><strong>פרטי חשבון:</strong> אם נרשמת — כתובת אימייל, שם תצוגה, וסיסמה מוצפנת (bcrypt).</li>
              <li><strong>העדפות:</strong> קבוצות וליגות שסימנת כמועדפות (נשמר על השרת שלנו).</li>
              <li><strong>מידע טכני:</strong> כתובת IP, סוג מכשיר, גרסת אפליקציה — לצורך אבטחה ואבחון תקלות.</li>
              <li><strong>Cookies / Tokens:</strong> אסימוני הזדהות (JWT + refresh) הנשמרים מקומית על המכשיר. ה-refresh token נשמר ב-Keychain של iOS.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">מה אנחנו <em>לא</em> אוספים</h2>
            <ul className="list-inside list-disc space-y-2">
              <li>תוכן צ&apos;אטים או הודעות — אין צ&apos;אט בשירות.</li>
              <li>מיקום פיזי, מצלמה, מיקרופון, או אנשי קשר.</li>
              <li>נתוני שימוש מפורטים לצורכי שיווק או רשתות פרסום צד-שלישי.</li>
              <li>נתוני בריאות, מימון, או מידע רגיש אחר.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">איך אנחנו משתמשים במידע</h2>
            <ul className="list-inside list-disc space-y-2">
              <li>לאפשר התחברות וזיהוי המשתמש.</li>
              <li>להציג תוכן מותאם (לדוגמה: הקבוצה המועדפת שלך בראש הדף).</li>
              <li>למניעת זיופים ושימוש לרעה (rate-limiting, audit log פנימי).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">איפה המידע מאוחסן</h2>
            <p>
              על שרת ייעודי באירופה (Hetzner Cloud, גרמניה). הגישה אליו מוגנת ב-SSH key, וכל
              התקשורת מוצפנת ב-HTTPS באמצעות תעודה מ-Let&apos;s Encrypt.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">צד שלישי</h2>
            <p>אנחנו מרכזים נתוני כדורגל ציבוריים מספקי מידע ספורטיביים ומקורות פומביים, ללא העברת פרטים אישיים שלך:</p>
            <ul className="list-inside list-disc space-y-2 mt-2">
              <li>ספקי נתוני ספורט ומקורות מידע ציבוריים — נתוני משחקים, קבוצות ושחקנים.</li>
              <li>Apple Push Notification Service — אם תפעיל התראות בעתיד.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">הזכויות שלך</h2>
            <ul className="list-inside list-disc space-y-2">
              <li>גישה ועיון בנתונים שאספנו עליך.</li>
              <li>תיקון פרטים שאינם מעודכנים.</li>
              <li>מחיקת חשבון — שלח בקשה ל-yaniv@goldbond.co.il ונמחק את כל הנתונים תוך 30 ימים.</li>
              <li>ייצוא הנתונים שלך (Data Portability) בפורמט JSON.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">מחיקת חשבון</h2>
            <p>
              למחיקת חשבון: שלח אימייל ל-<a href="mailto:yaniv@goldbond.co.il" className="text-emerald-600 underline">yaniv@goldbond.co.il</a> מהכתובת
              של החשבון, עם הנושא &quot;מחיקת חשבון&quot;. נטפל בבקשה תוך 7 ימי עסקים.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">קטינים</h2>
            <p>השירות אינו מיועד לילדים מתחת לגיל 13. איננו אוספים מידע ממשתמשים מתחת לגיל זה ביודעין.</p>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">שינויים במדיניות</h2>
            <p>
              אם נשנה את מדיניות הפרטיות, נעדכן את התאריך בראש העמוד הזה. שינויים מהותיים יוכרזו
              גם דרך האפליקציה והאתר.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-stone-900">יצירת קשר</h2>
            <p>
              שאלות, תלונות, או בקשות נוגעות לפרטיות:
              <br />
              <a href="mailto:yaniv@goldbond.co.il" className="text-emerald-600 underline">yaniv@goldbond.co.il</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
