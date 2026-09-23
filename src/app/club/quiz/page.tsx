import Link from 'next/link';
import { weeklyQuiz } from '@/lib/fan-discovery-data';
import QuizQuestion from './QuizQuestion';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'חידון מהארכיון | StatsAI' };
export default async function QuizPage() {
  const fact = await weeklyQuiz();
  return <main dir="rtl" className="mx-auto max-w-3xl space-y-6 px-4 py-10"><Link href="/club" className="underline">חזרה למועדון</Link><h1 className="text-3xl font-black">שאלה מהארכיון</h1><p>שאלה שבועית ממשחק רשמי עם תוצאה שמורה באתר. התשובה והמקור נפתחים לאחר הבחירה. אותה שאלה מוצגת לכל הגולשים עד יום שני הבא ב־UTC; אז נבחר משחק אחר.</p>{fact ? <QuizQuestion question={{ id: fact.id, opponent: fact.opponent, homeTeam: fact.homeTeam, awayTeam: fact.awayTeam, competition: fact.competition, round: fact.round, season: fact.season, date: fact.date, home: fact.home }} /> : <p>אין עדיין משחקים עם נתונים מספיקים לחידון.</p>}</main>;
}
