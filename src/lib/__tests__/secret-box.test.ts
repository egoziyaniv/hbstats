import { encryptSecret, decryptSecret, isEncrypted } from '@/lib/secret-box';

describe('secret-box', () => {
  const prev = process.env.SETTINGS_ENC_KEY;
  beforeAll(() => { process.env.SETTINGS_ENC_KEY = 'test-encryption-key-at-least-32-bytes-long'; });
  afterAll(() => { process.env.SETTINGS_ENC_KEY = prev; });

  it('round-trips a secret', () => {
    const secret = 'sk-ant-api03-abcdefghijklmnop';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);          // ciphertext doesn't leak the value
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('produces different ciphertext each time (random IV) but same plaintext', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  it('passes through legacy plaintext (backward compatible)', () => {
    expect(isEncrypted('sk-legacy-plaintext')).toBe(false);
    expect(decryptSecret('sk-legacy-plaintext')).toBe('sk-legacy-plaintext');
  });

  it('handles empty/invalid input', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
    expect(decryptSecret(null as any)).toBe('');
    expect(decryptSecret('encv1:not-valid-base64-or-tampered')).toBe(''); // tamper → empty, never throws
  });
});
