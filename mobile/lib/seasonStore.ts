import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hbs.selectedSeasonYear';

type SeasonState = {
  /** Selected season's start-year (e.g. 2025 for 2025/26). null = "latest". */
  selectedYear: number | null;
  setSelectedYear: (year: number | null) => void;
  ready: boolean;
};

export const SeasonContext = createContext<SeasonState>({
  selectedYear: null,
  setSelectedYear: () => {},
  ready: false,
});

export function useSeasonStore() {
  return useContext(SeasonContext);
}

export function useSeasonStoreValue(): SeasonState {
  const [selectedYear, setSelectedYearRaw] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) setSelectedYearRaw(n);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const setSelectedYear = (year: number | null) => {
    setSelectedYearRaw(year);
    if (year == null) AsyncStorage.removeItem(STORAGE_KEY);
    else AsyncStorage.setItem(STORAGE_KEY, String(year));
  };

  return { selectedYear, setSelectedYear, ready };
}
