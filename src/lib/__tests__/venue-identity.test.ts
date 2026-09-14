import { canonicalizeVenueIdentity, resolveCanonicalVenueId } from '@/lib/venue-identity';

describe('Turner venue identity', () => {
  test.each([
    ['Yaakov Turner Toto Stadium', 'Beer Sheva'],
    ['Yaakov Turner Toto Stadium (Be’ér Shéva (Beer Sheva) )', 'Beer Sheva'],
    ['Toto Turner Stadium', null],
    ['באר שבע אצטדיון טוטו ע"ש טרנר', null],
  ])('maps %s to the API-Football Turner identity', (name, city) => {
    expect(canonicalizeVenueIdentity({ name, city, apiFootballId: null })).toEqual({
      apiFootballId: 867,
      nameEn: 'Yaakov Turner Toto Stadium',
      nameHe: 'אצטדיון טוטו טרנר',
      cityEn: 'Beer Sheva',
      cityHe: 'באר שבע',
    });
  });

  test('recognizes API-Football venue 867 even when its label changes', () => {
    expect(canonicalizeVenueIdentity({ name: 'Beer Sheva stadium', city: 'Beer Sheva', apiFootballId: 867 }))
      .toMatchObject({ apiFootballId: 867, nameHe: 'אצטדיון טוטו טרנר' });
  });

  test('does not merge the unrelated Turners Cross stadium in Cork', () => {
    expect(canonicalizeVenueIdentity({ name: "Turner's Cross", city: 'Cork', apiFootballId: 863 })).toBeNull();
  });

  test.each([
    'cmoycq3a00003apuryts2re7e',
    'cmoycq3bz000oapur26pffweg',
    'cmq5he64z01hm5j5xvpa75p9j',
  ])('keeps an old Turner URL working for %s', (legacyId) => {
    expect(resolveCanonicalVenueId(legacyId)).toBe('cmoycq3bj000iapure270zz7e');
  });

  test('leaves unrelated venue ids unchanged', () => {
    expect(resolveCanonicalVenueId('other-venue')).toBe('other-venue');
  });
});
