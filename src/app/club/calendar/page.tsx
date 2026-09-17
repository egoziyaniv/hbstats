import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CLUB_CALENDAR_URL } from '@/lib/club-calendar';
import CalendarSubscription from './CalendarSubscription';

export const metadata: Metadata = {
  title: 'יומן משחקי הפועל באר שבע | StatsAI',
  description: 'מינוי ליומן משחקי הפועל באר שבע — ליגה, גביעים ואירופה, עם עדכוני מועדים.',
};

export default function ClubCalendarPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link href="/club" className="text-sm text-stone-600 underline">חזרה למועדון</Link>
      <header className="space-y-3">
        <p className="font-bold text-[var(--accent)]">הפועל באר שבע</p>
        <h1 className="text-3xl font-black text-stone-900 sm:text-4xl">המשחק הבא כבר ביומן</h1>
        <p className="leading-7 text-stone-600">כל משחקי הליגה, הגביעים ואירופה בעונה הנוכחית ובעונה הקודמת, לצד משחקים עתידיים שפורסמו. המינוי ממשיך גם במעבר לעונה חדשה.</p>
      </header>
      <section aria-label="מינוי ליומן המשחקים" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
        <CalendarSubscription url={CLUB_CALENDAR_URL} />
      </section>
      <section className="space-y-3 rounded-2xl bg-stone-100 p-5 leading-7 text-stone-700" aria-labelledby="calendar-help">
        <h2 id="calendar-help" className="text-lg font-bold text-stone-900">איך זה עובד?</h2>
        <p>בחרו את שירות היומן ואשרו את המינוי. אפשר גם להעתיק את הקישור ולהוסיף אותו ביומן תחת ״הוספה באמצעות כתובת URL״ או ״מינוי ליומן״. ב־Google מומלץ לבצע את ההוספה בדפדפן במחשב.</p>
        <p>יש להוסיף כמינוי מתעדכן. ייבוא קובץ חד־פעמי לא יקבל שינויים בהמשך. קצב הרענון נקבע על ידי שירות היומן, ועדכון עשוי להופיע רק לאחר מספר שעות ואף יותר.</p>
        <p>משחק שנדחה או ששעתו טרם נקבעה יוצג כאירוע יומי עם הכיתוב ״מועד לא נקבע״. התאריך הוא מציין מקום לפי המועד האחרון במערכת ואינו מועד מאושר. משחק שבוטל מסומן כמבוטל.</p>
        <p>משך משחק ביומן מוערך בשעתיים. השעות מוצגות לפי אזור הזמן של היומן שלכם. לפני היציאה למשחק, בדקו את המועד העדכני בעמוד המשחק. משחקי ידידות אינם כלולים.</p>
      </section>
    </main>
  );
}
