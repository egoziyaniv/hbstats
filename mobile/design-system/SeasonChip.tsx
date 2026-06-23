/**
 * SeasonChip — small pill in the header area showing the active season.
 * Tapping opens a modal with all available seasons; selecting one updates
 * the global SeasonContext so every season-aware hook refetches.
 */

import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { useSeasonStore } from '@/lib/seasonStore';
import { useSeasons } from '@/hooks/useSeasons';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from './theme';

function seasonLabel(name: string): string {
  // Normalize the various stored season name formats to a uniform "YYYY/YY".
  // "2024/25" → "2024/25"
  // "2024/2025" → "2024/25"
  // "2024-2025" → "2024/25"
  const m = name.match(/^(\d{4})[\/\-](\d{2,4})$/);
  if (!m) return name;
  const start = m[1];
  const end = m[2].length === 4 ? m[2].slice(2) : m[2];
  return `${start}/${end}`;
}

export function SeasonChip() {
  const { selectedYear, setSelectedYear } = useSeasonStore();
  const { data, isLoading } = useSeasons();
  const { brand } = useTheme();
  const [open, setOpen] = useState(false);

  const seasons = data?.seasons ?? [];
  // Default (no explicit pick) to the latest STARTED season — matches what the
  // data endpoints return, so the chip and the table/stats agree. (month >= 6
  // => July+, so the previous season shows through the summer gap.)
  const currentStartYear = (() => {
    const d = new Date();
    return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  })();
  const defaultSeason = seasons.find((s) => s.year <= currentStartYear) ?? seasons[0];
  const active = selectedYear == null
    ? defaultSeason
    : seasons.find((s) => s.year === selectedYear) ?? defaultSeason;
  const label = active ? seasonLabel(active.name) : '—';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: theme.ink[100],
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
        hitSlop={8}
      >
        <Text style={{ color: theme.ink[900], fontSize: 12, fontWeight: '700' }}>
          {label}
        </Text>
        <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={theme.ink[700]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9l6 6 6-6" />
        </Svg>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
          <View
            style={{
              paddingTop: 16,
              paddingBottom: 12,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.ink[200],
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.ink[900] }}>בחר עונה</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={{ color: brand.accent, fontSize: 15, fontWeight: '700' }}>סגור</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={brand.accent} />
          ) : (
            <FlatList
              data={seasons}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item }) => {
                const isActive = active?.id === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      setSelectedYear(item.year);
                      setOpen(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isActive ? theme.ink[100] : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: isActive ? '800' : '500', color: theme.ink[900] }}>
                      {seasonLabel(item.name)}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.ink[500] }}>
                      {item.gameCount.toLocaleString('he')} משחקים
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}
