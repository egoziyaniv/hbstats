import { useState } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { rtlRow } from '@/lib/rtl';
import { TeamCrest } from '@/design-system/TeamCrest';
import { useRouter } from 'expo-router';
import { TabBar } from '@/design-system/TabBar';
import { useStandings, type StandingsScope } from '@/hooks/useStandings';
import { useTheme } from '@/contexts/ThemeContext';
import { absoluteImage } from '@/lib/config';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { Section } from '@/design-system/Section';
import { FormRow } from '@/design-system/FormPill';
import { SeasonChip } from '@/design-system/SeasonChip';
import { theme } from '@/design-system/theme';
import { useSeasonStore } from '@/lib/seasonStore';
import type { StandingsRow } from '@shared/types/mobile-api';

// Visual zone strip on each row. Israeli Premier League rules used here:
//   #1            → gold (champion)
//   #2            → brand colour (Champions League qual.)
//   #3 / #4       → orange (Europa Conference / Europa)
//   bottom 2 (N-1, N) of the FULL table → red (relegation)
// Mid-table teams in either playoff group (e.g. Maccabi Haifa #5 of
// championship, Hapoel Petah Tikva #6 of championship, the upper rows of the
// relegation group) intentionally have no strip — only the actual relegation
// positions at the very bottom of the overall table get one.
const ZONE = {
  champion: '#F59E0B',
  europa: '#EA580C',
  relegation: '#DC2626',
} as const;

function zoneColor(rank: number, totalTable: number, brandAccent: string): string | null {
  if (rank === 1) return ZONE.champion;
  if (rank === 2) return brandAccent;
  if (rank <= 4) return ZONE.europa;
  if (totalTable > 0 && rank >= totalTable - 1) return ZONE.relegation;
  return null;
}

export default function StandingsScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { selectedYear } = useSeasonStore();
  const [scope, setScope] = useState<StandingsScope>('all');
  const { data, isLoading, refetch, isRefetching } = useStandings(selectedYear, scope);
  const headerTitle = 'טבלת ליגה';
  const headerSubtitle = data?.season?.name ? `עונת ${data.season.name}` : undefined;
  const headerRight = <SeasonChip />;

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title={headerTitle} subtitle={headerSubtitle} rightSlot={headerRight} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      </View>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
        <Header title={headerTitle} subtitle={headerSubtitle} rightSlot={headerRight} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.ink[700], fontSize: 14 }}>
            הטבלה לא זמינה כרגע.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      <Header title={headerTitle} subtitle={headerSubtitle} rightSlot={headerRight} />
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TabBar
          items={[
            { id: 'all', label: 'הכל' },
            { id: 'home', label: 'בית' },
            { id: 'away', label: 'חוץ' },
          ]}
          value={scope}
          onChange={(id) => setScope(id as StandingsScope)}
        />
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
        contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingBottom: 32 }}
      >
        {(() => {
          const totalTable = data.groups.reduce((sum, g) => sum + g.rows.length, 0);
          return data.groups.map((group) => (
          <Section key={group.label} title={group.label} dense>
            <Card pad={false}>
              {/* Column header */}
              <View
                style={{
                  flexDirection: rtlRow(),
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  backgroundColor: theme.ink[50],
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                }}
              >
                <Text style={{ width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>#</Text>
                <View style={{ width: 22, marginStart: 10, marginEnd: 8 }} />
                <Text style={{ flexShrink: 1, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'right', writingDirection: 'rtl' }}>קבוצה</Text>
                <Text style={{ marginStart: 'auto', width: 24, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>מ'</Text>
                <Text style={{ width: 36, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>הפרש</Text>
                <Text style={{ width: 32, fontSize: 10, fontWeight: '700', color: theme.ink[500], textAlign: 'center' }}>נק'</Text>
              </View>
              {group.rows.map((row, i) => (
                <StandingsRowView key={row.teamId} row={row} index={i} totalGroup={group.rows.length} totalTable={totalTable} onPress={() => router.push(`/teams/${row.teamId}` as any)} brand={brand} scoped={scope !== 'all'} />
              ))}
            </Card>
            {/* Zone-strip legend — explains the coloured vertical strip at
                the row's start edge. Zones describe the OVERALL table only,
                so hide the legend in the בית/חוץ scoped views. */}
            {scope === 'all' ? (
              <View style={{ paddingHorizontal: 16, marginTop: 6, gap: 4 }}>
                <ZoneLegend brand={brand} />
              </View>
            ) : null}
          </Section>
        ));
        })()}
      </ScrollView>
    </View>
  );
}

function StandingsRowView({
  row,
  index,
  totalGroup,
  totalTable,
  onPress,
  brand,
  scoped,
}: {
  row: StandingsRow;
  index: number;
  totalGroup: number;
  totalTable: number;
  onPress: () => void;
  brand: { accent: string; accentGlow: string };
  scoped: boolean;
}) {
  const zc = scoped ? null : zoneColor(row.position, totalTable, brand.accent);
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: rtlRow(),
          alignItems: 'center',
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderBottomWidth: index === totalGroup - 1 ? 0 : 1,
          borderBottomColor: theme.ink[100],
          position: 'relative',
        }}
      >
        {/* Zone bar on the right edge (RTL start) */}
        {zc ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              bottom: 8,
              right: 0,
              width: 3,
              backgroundColor: zc,
              borderRadius: 2,
            }}
          />
        ) : null}

        <Text style={{ width: 24, fontSize: 13, fontWeight: '800', color: theme.ink[500], textAlign: 'center' }}>
          {row.position}
        </Text>

        <TeamCrest name={row.teamNameHe} logoUrl={row.logoUrl} size={22} radius={4} style={{ marginStart: 10, marginEnd: 8 }} />
        {/* Team name attached to the logo (auto width). The numeric columns
            after this get pushed to the opposite (visual left) edge via
            marginStart on the first stat. */}
        <Text
          style={{ flexShrink: 1, fontSize: 13.5, fontWeight: '600', color: theme.ink[900], textAlign: 'right' }}
          numberOfLines={1}
        >
          {row.teamNameHe}
        </Text>

        <Text style={{ marginStart: 'auto', width: 24, fontSize: 11, color: theme.ink[500], textAlign: 'center' }}>{row.played}</Text>
        <Text
          style={{ width: 36, fontSize: 11, fontWeight: '600', color: row.goalsDiff > 0 ? theme.result.win : row.goalsDiff < 0 ? theme.result.loss : theme.ink[500], textAlign: 'center' }}
        >
          {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
        </Text>
        <View
          style={{
            width: 32,
            backgroundColor: brand.accentGlow,
            borderRadius: 6,
            paddingVertical: 2,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.ink[900], textAlign: 'center' }}>
            {row.points}
          </Text>
          {row.pointsAdjustment !== 0 ? (
            <Text style={{ fontSize: 9, fontWeight: '700', color: theme.result.loss, marginTop: -1 }}>
              {row.pointsAdjustment > 0 ? `+${row.pointsAdjustment}` : row.pointsAdjustment}
            </Text>
          ) : null}
        </View>
      </View>
      {row.form ? (
        // Form (last-5) aligned to the visual LEFT, under the points column.
        <View style={{ paddingHorizontal: 14, paddingBottom: 8, flexDirection: rtlRow(), justifyContent: 'flex-end' }}>
          <FormRow form={row.form} size={16} gap={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ZoneLegend({ brand }: { brand: { accent: string } }) {
  const items = [
    { color: ZONE.champion, label: 'אלופה' },
    { color: brand.accent, label: 'מוקדמות אלופות' },
    { color: ZONE.europa, label: 'מוקדמות אירופה' },
    { color: ZONE.relegation, label: 'ירידה / פלייאוף ירידה' },
  ];
  return (
    <View style={{ flexDirection: rtlRow(), flexWrap: 'wrap', gap: 10 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 4 }}>
          <View style={{ width: 3, height: 12, backgroundColor: it.color, borderRadius: 2 }} />
          <Text style={{ fontSize: 10, color: theme.ink[500] }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}
