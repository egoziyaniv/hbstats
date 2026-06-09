import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import AiChat from '@/components/AiChat';
import { ThemeProvider } from '@/components/ThemeProvider';

const heebo = Heebo({
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  title: {
    default: 'StatsAI — סטטיסטיקה שמנצחת את המשחק',
    template: '%s — StatsAI',
  },
  description: 'StatsAI — סטטיסטיקה שמנצחת את המשחק. מערכת עברית לסטטיסטיקות כדורגל, ניתוח נתונים, משחקים, שחקנים וקבוצות.',
};

// Runs synchronously before first paint — sets data-theme/data-color from localStorage.
const noFlashScript = `(function(){try{var t=localStorage.getItem('hbs-theme')||'modern';var c=localStorage.getItem('hbs-color')||'red';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-color',c);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="bg-[#f4f6fb] text-slate-950">
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <ThemeProvider>
          <Navbar />
          <AiChat />
          <main className="min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
