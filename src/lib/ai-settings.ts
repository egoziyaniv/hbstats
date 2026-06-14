import prisma from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/secret-box';

export const AI_ENABLED_KEY = 'ai_enabled';
export const AI_PROVIDER_KEY = 'ai_provider';
export const AI_API_KEY_CLAUDE = 'ai_api_key_claude';
export const AI_API_KEY_OPENAI = 'ai_api_key_openai';

export type AiProvider = 'claude' | 'openai';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  apiKeyClaude: string;
  apiKeyOpenai: string;
}

async function getSetting(key: string): Promise<unknown> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.valueJson ?? null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const [enabled, provider, keyClaude, keyOpenai] = await Promise.all([
    getSetting(AI_ENABLED_KEY),
    getSetting(AI_PROVIDER_KEY),
    getSetting(AI_API_KEY_CLAUDE),
    getSetting(AI_API_KEY_OPENAI),
  ]);

  return {
    enabled: enabled === true,
    provider: provider === 'openai' ? 'openai' : 'claude',
    // Stored encrypted (AES-GCM); decryptSecret passes through legacy plaintext.
    apiKeyClaude: decryptSecret(keyClaude),
    apiKeyOpenai: decryptSecret(keyOpenai),
  };
}

/** Store an AI API key encrypted at rest. */
export async function updateAiApiKey(key: string, plaintext: string): Promise<void> {
  await updateAiSetting(key, encryptSecret(plaintext));
}

export async function getActiveApiKey(settings: AiSettings): Promise<string | null> {
  if (!settings.enabled) return null;
  const key = settings.provider === 'openai' ? settings.apiKeyOpenai : settings.apiKeyClaude;
  return key || null;
}

export async function updateAiSetting(key: string, value: unknown): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { valueJson: value as any },
    create: { key, valueJson: value as any },
  });
}
