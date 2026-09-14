import { translateIsraeliVenue } from '@/lib/israeli-venue-translation';

describe('Israeli venue translation', () => {
  test.each([
    ['Arad Municipal Stadium', 'Arad', 'האצטדיון העירוני ערד'],
    ['Petach Tikva Sirkin Training 2', 'Petach-Tikva', 'מגרש האימונים סירקין 2 פתח תקווה'],
    ['Ashkelon Artificial Field', 'Ashkelon', 'המגרש הסינתטי אשקלון'],
    ['Kiryat Eli\'ezer Stadium', 'Haifa', 'אצטדיון קריית אליעזר'],
    ['Municipal Stadium', 'Tamra', 'האצטדיון העירוני טמרה'],
  ])('translates %s', (nameEn, cityEn, expected) => {
    expect(translateIsraeliVenue(nameEn, cityEn)).toEqual({
      nameHe: expected,
      cityHe: expect.stringMatching(/[א-ת]/),
    });
  });

  test('returns null when the city is not recognized as Israeli', () => {
    expect(translateIsraeliVenue('National Stadium', 'London')).toBeNull();
  });
});
