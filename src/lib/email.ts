/**
 * Email sending — provider-agnostic.
 *
 * No delivery provider is wired yet (decision pending). Until one is connected,
 * sendEmail() LOGS the message (including any reset link) to the server console
 * so the flow is fully functional end-to-end and ops can recover the link.
 *
 * To go live, implement one branch below (e.g. Resend/SES/SMTP) gated on its
 * env var — the call sites do not change.
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

  // Fallback: log so the link/content is recoverable while no provider is set.
  console.log(
    `[email:stub] (no provider configured)\n  to: ${email.to}\n  subject: ${email.subject}\n  ${email.text}`
  );
  return { delivered: false };
}

export function isEmailConfigured(): boolean {
  // Flip to true once a provider branch above is enabled.
  return false;
}
