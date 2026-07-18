jest.mock('@/lib/stats-qa/registry', () => ({
  REGISTRY: [],
  getQuestion: jest.fn(),
}));
jest.mock('@/lib/stats-qa/narrative', () => ({
  getNarrative: jest.fn(),
  getDataVersion: jest.fn(),
}));

import { getQuestion } from '@/lib/stats-qa/registry';
import { getNarrative, getDataVersion } from '@/lib/stats-qa/narrative';
import { answerQuestion } from '@/lib/stats-qa';

describe('answerQuestion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('short-circuits with an empty-state card when a club question is called without a clubKey', async () => {
    const resolve = jest.fn().mockRejectedValue(new Error('resolve should not be called'));
    (getQuestion as jest.Mock).mockReturnValue({
      id: 'club_biggest_win',
      scope: 'club',
      needsClub: true,
      cardType: 'hero',
      titleHe: () => 'הניצחון הכי גדול',
      resolve,
    });

    const card = await answerQuestion('club_biggest_win', {});

    expect(card).toEqual({
      headline: null,
      id: 'club_biggest_win',
      titleHe: 'הניצחון הכי גדול',
      cardType: 'hero',
      narrative: null,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(getDataVersion).not.toHaveBeenCalled();
    expect(getNarrative).not.toHaveBeenCalled();
  });

  it('returns null when the question id is unknown', async () => {
    (getQuestion as jest.Mock).mockReturnValue(undefined);
    expect(await answerQuestion('nope', {})).toBeNull();
  });

  it('still resolves normally when a club question is called with a clubKey', async () => {
    const answer = { headline: { label: 'x', value: '1' } };
    const resolve = jest.fn().mockResolvedValue(answer);
    (getQuestion as jest.Mock).mockReturnValue({
      id: 'club_biggest_win',
      scope: 'club',
      needsClub: true,
      cardType: 'hero',
      titleHe: () => 'כותרת',
      resolve,
    });
    (getDataVersion as jest.Mock).mockResolvedValue('v1');
    (getNarrative as jest.Mock).mockResolvedValue('נרטיב');

    const card = await answerQuestion('club_biggest_win', { clubKey: 'api-563' });

    expect(resolve).toHaveBeenCalledWith({ clubKey: 'api-563' });
    expect(card).toEqual({ ...answer, id: 'club_biggest_win', titleHe: 'כותרת', cardType: 'hero', narrative: 'נרטיב' });
  });
});
