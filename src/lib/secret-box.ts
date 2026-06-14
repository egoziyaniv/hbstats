import crypto from 'crypto';

/**
 * Symmetric encryption for secrets stored in the DB (e.g. admin-entered AI API
 * keys in SiteSetting), so they don't sit in plaintext and don't leak via DB
 * exports. AES-256-GCM with a key derived from SETTINGS_ENC_KEY (falling back to
 * JWT_SECRET). Values are tagged with a version prefix so we can recognise
 * ciphertext and transparently pass through legacy plaintext.
 */
const PREFIX = 'encv1:';

function encryptionKey(): Buffer {
  const secret = process.env.SETTINGS_ENC_KEY || process.env.JWT_SECRET || '';
  if (!secret) {
    throw new Error('SETTINGS_ENC_KEY or JWT_SECRET must be set to encrypt secrets');
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(stored: unknown): string {
  if (typeof stored !== 'string') return '';
  // Legacy plaintext (pre-encryption) — return as-is for backward compatibility.
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
