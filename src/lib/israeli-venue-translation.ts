import translations from '@/data/israeli-venue-translations.json';
import { canonicalizeVenueIdentity } from '@/lib/venue-identity';

const cityTranslations = translations.cityTranslations as Record<string, string>;
const venueOverrides = translations.venueOverrides as Record<string, string>;

function numberSuffix(value: string): string {
  const matches = value.match(/\b\d+\b/g);
  return matches?.length ? ` ${matches.join(' ')}` : '';
}

export function translateIsraeliVenue(
  nameEn: string,
  cityEn?: string | null
): { nameHe: string; cityHe: string | null } | null {
  const canonical = canonicalizeVenueIdentity({ name: nameEn, city: cityEn });
  if (canonical) return { nameHe: canonical.nameHe, cityHe: canonical.cityHe };

  const cityHe = cityEn ? cityTranslations[cityEn] || null : null;
  const override = venueOverrides[nameEn];
  if (override) return { nameHe: override, cityHe };
  if (!cityHe) return null;

  const suffix = numberSuffix(nameEn);
  let prefix = 'אצטדיון';
  if (/training/i.test(nameEn)) prefix = 'מגרש האימונים';
  else if (/artificial|synthetic|senti/i.test(nameEn)) prefix = 'המגרש הסינתטי';
  else if (/football school/i.test(nameEn)) prefix = 'מגרש בית הספר לכדורגל';
  else if (/field|ground|lot/i.test(nameEn)) prefix = 'מגרש';
  else if (/municipal/i.test(nameEn)) prefix = 'האצטדיון העירוני';

  return { nameHe: `${prefix} ${cityHe}${suffix}`, cityHe };
}
