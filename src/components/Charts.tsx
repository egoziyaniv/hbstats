'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-black text-stone-900">{title}</h2>
      <div className="h-[320px] w-full">{children}</div>
    </section>
  );
}

export function TeamChartsView({
  goalsByMatchday,
  leaguePositions,
  comparedTeams,
  leagueTeamCount,
  resultBreakdown,
  topScorers,
  topAssisters,
}: {
  goalsByMatchday: Array<{ מחזור: string; זכות: number; חובה: number }>;
  leaguePositions: Array<Record<string, string | number>>;
  comparedTeams: Array<{ id: string; name: string; color: string }>;
  leagueTeamCount: number | null;
  resultBreakdown: Array<{ name: string; value: number }>;
  topScorers: Array<{ שחקן: string; שערים: number }>;
  topAssisters: Array<{ שחקן: string; בישולים: number }>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard title="שערי זכות מול שערי חובה לפי מחזור">
        <ResponsiveContainer>
          <LineChart data={goalsByMatchday}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="מחזור" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="זכות" stroke="#b91c1c" strokeWidth={3} />
            <Line type="monotone" dataKey="חובה" stroke="#111827" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="מקום בטבלה לפי מחזור">
        {leagueTeamCount && leaguePositions.length > 0 ? (
          <ResponsiveContainer>
            <LineChart data={leaguePositions}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="מחזור" />
              <YAxis reversed domain={[leagueTeamCount, 1]} allowDecimals={false} ticks={Array.from({ length: leagueTeamCount }, (_, index) => index + 1)} />
              <Tooltip formatter={(value: number) => [`מקום ${value}`, 'מיקום']} />
              <Legend />
              {comparedTeams.map((team) => (
                <Line key={team.id} type="monotone" dataKey={team.name} stroke={team.color} strokeWidth={3} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-stone-50 px-8 text-center text-stone-600">
            גרף מיקום בטבלה זמין במסגרת ליגה לאחר שהושלם לפחות מחזור אחד.
          </div>
        )}
      </ChartCard>

      <ChartCard title="התפלגות ניצחונות / תיקו / הפסדים">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={resultBreakdown} dataKey="value" nameKey="name" outerRadius={100} fill="#b91c1c" label />
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="חמשת הכובשים המובילים">
        <ResponsiveContainer>
          <BarChart data={topScorers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="שחקן" interval={0} angle={-12} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="שערים" fill="#b91c1c" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="חמשת המבשלים המובילים">
          <ResponsiveContainer>
            <BarChart data={topAssisters}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="שחקן" interval={0} angle={-12} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="בישולים" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export function PlayerChartsView({
  goalsAssists,
  minutesPlayed,
  cards,
}: {
  goalsAssists: Array<{ עונה: string; שערים: number; בישולים: number }>;
  minutesPlayed: Array<{ עונה: string; דקות: number }>;
  cards: Array<{ עונה: string; צהובים: number; אדומים: number }>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartCard title="שערים ובישולים לפי עונה">
        <ResponsiveContainer>
          <BarChart data={goalsAssists}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="שערים" fill="#b91c1c" />
            <Bar dataKey="בישולים" fill="#1d4ed8" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="דקות משחק לפי עונה">
        <ResponsiveContainer>
          <BarChart data={minutesPlayed}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="דקות" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="כרטיסים לפי עונה">
        <ResponsiveContainer>
          <BarChart data={cards}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="צהובים" stackId="cards" fill="#eab308" />
            <Bar dataKey="אדומים" stackId="cards" fill="#b91c1c" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export function GoalMinutesChart({ data }: { data: Array<{ name: string; goals: number }> }) {
  return (
    <div className="h-[200px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
            formatter={(value: number) => [`${value} שערים`, 'שערים']}
          />
          <Bar dataKey="goals" fill="#991b1b" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClubPointsTrendChart({ data }: { data: Array<{ match: number; points: number }> }) {
  return (
    <div className="h-[190px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="match" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
            labelFormatter={(match) => `משחק ${match}`}
            formatter={(value: number) => [`${value} נקודות`, 'צבירה']}
          />
          <Line type="monotone" dataKey="points" stroke="var(--accent, #b91c1c)" strokeWidth={3} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ContractExpiryChart({ data }: { data: Array<{ year: number; count: number }> }) {
  return (
    <div className="h-[260px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
            formatter={(value: number) => [`${value} שחקנים`, 'מסיימים חוזה']}
            labelFormatter={(label) => `שנת ${label}`}
          />
          <Bar dataKey="count" fill="var(--accent, #b91c1c)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
