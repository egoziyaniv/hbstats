import { canonicalizeVenueIdentity, resolveCanonicalVenueId } from '@/lib/venue-identity';

describe('Turner venue identity', () => {
  test.each([
    ['Yaakov Turner Toto Stadium', 'Beer Sheva'],
    ['Yaakov Turner Toto Stadium (Be’ér Shéva (Beer Sheva) )', 'Beer Sheva'],
    ['Toto Turner Stadium', null],
    ['באר שבע אצטדיון טוטו ע"ש טרנר', null],
  ])('maps %s to the API-Football Turner identity', (name, city) => {
    expect(canonicalizeVenueIdentity({ name, city, apiFootballId: null })).toEqual({
      id: 'cmoycq3bj000iapure270zz7e',
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

describe('Israeli venue identity catalogue', () => {
  test.each([
    ["Acre Municipal Stadium ('Akko (Accre))", null, 3403, 'האצטדיון העירוני עכו'],
    ['Winner Stadium', 869, 11941, 'אצטדיון נתניה'],
    ['Teddy Stadium', null, 866, 'אצטדיון טדי'],
    ['Grundman Stadium', null, 3409, 'אצטדיון גרונדמן'],
    ['Ness Ziona Stadium', null, 3415, 'אצטדיון נס ציונה'],
    ['Municipal Stadium', 4583, 4583, 'האצטדיון העירוני מעלות-תרשיחא'],
  ])('canonicalizes %s without creating another venue', (name, apiFootballId, canonicalApiId, nameHe) => {
    expect(canonicalizeVenueIdentity({ name, city: null, apiFootballId })).toMatchObject({
      apiFootballId: canonicalApiId,
      nameHe,
    });
  });

  test.each([
    ['cmoycq3ah000aapur7vurj7rj', 'cmoycq3cj000uapur20qg6i0y'],
    ['cmoycq3a80006apurcqlwd86z', 'cmoycq3c5000rapur851cozvb'],
    ['cmoycq3cm000vapurwlji8skv', 'cmoycq3bb000gapurnxebjt5g'],
  ])('keeps merged Israeli venue URL %s working', (legacyId, canonicalId) => {
    expect(resolveCanonicalVenueId(legacyId)).toBe(canonicalId);
  });

  test('does not merge a same-named foreign venue when the city conflicts', () => {
    expect(canonicalizeVenueIdentity({ name: 'Green Stadium', city: 'London', apiFootballId: null })).toBeNull();
  });
});
