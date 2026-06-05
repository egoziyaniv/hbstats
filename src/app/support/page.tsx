export const metadata = {
  title: 'תמיכה',
  description: 'מרכז התמיכה של StatsAI — שאלות נפוצות ויצירת קשר.',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-16" dir="rtl">
      <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-stone-900">תמיכה</h1>
        <p className="mt-2 text-stone-600">צוות הפיתוח של StatsAI — כאן לעזור.</p>

        <section className="mt-8">
          <h2 className="text-xl font-black text-stone-900">יצירת קשר ישירה</h2>
          <div className="mt-3 grid gap-2 text-sm leading-7 text-stone-700">
            <div>
              <strong>אימייל:</strong>{' '}
              <a href="mailto:yaniv@goldbond.co.il" className="text-emerald-600 underline">yaniv@goldbond.co.il</a>
            </div>
            <div>
              <strong>זמן תגובה:</strong> תוך 48 שעות (לרוב מהר יותר)
            </div>
            <div>
              <strong>שעות פעילות:</strong> א&apos;-ה&apos;, 09:00–18:00 (ישראל)
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-black text-stone-900">שאלות נפוצות</h2>

          <div className="mt-4 space-y-5 text-sm leading-7 text-stone-700">
            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">איך מתחילים?</summary>
              <p className="mt-2">
                האפליקציה זמינה ב-App Store. הורד, פתח, הרשם בכמה שניות. אפשר גם להשתמש באתר{' '}
                <a href="https://hbs.co.il" className="text-emerald-600 underline">hbs.co.il</a> בלי הרשמה.
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">איך לבחור קבוצה / ליגה מועדפת?</summary>
              <p className="mt-2">
                באפליקציה: לחץ על &quot;הגדרות&quot; → בחר קבוצות (לחיצה על הצ&apos;יפ הופכת אותה לצבעונית) → אותו דבר לליגות. ההעדפות נשמרות אוטומטית בשרת.
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">הנתונים לא עדכניים</summary>
              <p className="mt-2">
                משוך מטה (Pull-to-refresh) בכל מסך כדי לטעון מחדש. הנתונים מתעדכנים אוטומטית כל 60 שניות. אם משהו עדיין נראה ישן, נסה לסגור ולפתוח את האפליקציה.
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">איך מוחקים חשבון?</summary>
              <p className="mt-2">
                שלח אימייל ל-yaniv@goldbond.co.il מאותה כתובת שאיתה נרשמת, עם הנושא &quot;מחיקת חשבון&quot;. נטפל תוך 7 ימי עסקים. ראה{' '}
                <a href="/privacy" className="text-emerald-600 underline">מדיניות פרטיות</a> לפרטים מלאים.
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">אפליקציה קורסת או לא נטענת</summary>
              <p className="mt-2">
                ודא שיש לך גרסת iOS 15 ומעלה. נסה: סגירת האפליקציה לחלוטין (swipe-up מהמסך הראשי) → פתיחה מחדש. אם הבעיה ממשיכה, שלח לנו אימייל עם פרטי המכשיר ומה שראית.
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">איך מדווחים על באג / נתון שגוי?</summary>
              <p className="mt-2">
                אימייל לכתובת התמיכה עם:
                <br />- מסך שראיתי (צילום מסך עוזר!)
                <br />- מה ציפיתי לראות
                <br />- שם הקבוצה/שחקן/משחק הרלוונטי
              </p>
            </details>

            <details className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer font-bold text-stone-900">תכונות חדשות שעובדים עליהן</summary>
              <p className="mt-2">
                התראות Push למשחקים של הקבוצות המועדפות, מסך חיפוש כללי, ושיתוף לקבוצות WhatsApp. רעיון נוסף? שלח לנו!
              </p>
            </details>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <strong>טיפ:</strong> אם אתה משתמש קבוע, סמן את ההעדפות שלך (קבוצות + ליגות) ב-הגדרות → תקבל תוכן מותאם בעמוד הבית.
          </p>
        </section>
      </div>
    </div>
  );
}
