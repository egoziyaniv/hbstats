import { getDataVersion, getNarrative } from '@/lib/stats-qa/narrative';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    siteSetting: { findUnique: jest.fn() },
    statNarrative: { findUnique: jest.fn(), create: jest.fn() },
  },
}));
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/ai-settings', () => ({ getAiSettings: jest.fn(), getActiveApiKey: jest.fn() }));
jest.mock('@/lib/ai-providers', () => ({ chatWithClaude: jest.fn(), chatWithOpenAI: jest.fn() }));
import { getActiveApiKey, getAiSettings } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI } from '@/lib/ai-providers';

describe('getDataVersion', () => {
  it('returns the stored stat_data_version value', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue({ valueJson: 'v-123' });
    expect(await getDataVersion()).toBe('v-123');
  });
  it('falls back to "0" when unset', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await getDataVersion()).toBe('0');
  });
});

describe('getNarrative', () => {
  const answer = { headline: { label: 'ברדה', value: '94', unit: 'שערים' } } as any;
  beforeEach(() => jest.clearAllMocks());

  it('returns cached text without calling the LLM', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue({ text: 'משפט שמור' });
    const t = await getNarrative('club_top_scorer:api-563', 'v1', 'שאלה', answer);
    expect(t).toBe('משפט שמור');
    expect(chatWithClaude).not.toHaveBeenCalled();
  });
  it('generates + caches on miss (claude provider)', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue(null);
    (getAiSettings as jest.Mock).mockResolvedValue({ provider: 'claude' });
    (getActiveApiKey as jest.Mock).mockResolvedValue('sk-x');
    (chatWithClaude as jest.Mock).mockResolvedValue('משפט חדש');
    const t = await getNarrative('club_top_scorer:api-563', 'v1', 'שאלה', answer);
    expect(t).toBe('משפט חדש');
    expect(chatWithClaude).toHaveBeenCalled();
    expect(chatWithOpenAI).not.toHaveBeenCalled();
    expect(prisma.statNarrative.create).toHaveBeenCalled();
  });
  it('dispatches to OpenAI when that provider is active', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue(null);
    (getAiSettings as jest.Mock).mockResolvedValue({ provider: 'openai' });
    (getActiveApiKey as jest.Mock).mockResolvedValue('sk-openai');
    (chatWithOpenAI as jest.Mock).mockResolvedValue('משפט מ-OpenAI');
    const t = await getNarrative('club_top_scorer:api-563', 'v1', 'שאלה', answer);
    expect(t).toBe('משפט מ-OpenAI');
    expect(chatWithOpenAI).toHaveBeenCalled();
    expect(chatWithClaude).not.toHaveBeenCalled();
  });
  it('returns null (never throws) when generation fails', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue(null);
    (getAiSettings as jest.Mock).mockResolvedValue({ provider: 'claude' });
    (getActiveApiKey as jest.Mock).mockResolvedValue('sk-x');
    (chatWithClaude as jest.Mock).mockRejectedValue(new Error('LLM down'));
    expect(await getNarrative('k', 'v1', 'שאלה', answer)).toBeNull();
  });
  it('returns null when no headline (empty-state → no narrative)', async () => {
    expect(await getNarrative('k', 'v1', 'שאלה', { headline: null } as any)).toBeNull();
    expect(prisma.statNarrative.findUnique).not.toHaveBeenCalled();
  });
});
