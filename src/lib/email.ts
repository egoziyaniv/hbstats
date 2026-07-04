/**
 * Email sending — provider-agnostic.
 *
 * No delivery provider is wired yet (decision pending). We deliberately do NOT
 * log the message body — it can contain a password-reset link/token, and logging
 * it is an account-takeover-via-logs vector. Until a provider is connected the
 * reset email simply isn't delivered (delivered:false); wire a branch below to
 * go live. Call sites do not change.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<{ delivered: boolean }> {
  // --- Wire a real provider here, e.g.:
  // if (process.env.RESEND_API_KEY) { ...; return { delivered: true }; }

  // No provider configured. Log ONLY non-sensitive metadata — never the body,
  // which may carry a reset token/link.
  console.warn(`[email] no provider configured — not delivered. to=${email.to} subject="${email.subject}"`);
  return { delivered: false };
}

export function isEmailConfigured(): boolean {
  // Flip to true once a provider branch above is enabled.
  return false;
}
