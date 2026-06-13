import { ForgotPasswordForm } from '@/components/AuthForms';

export const metadata = { title: 'איפוס סיסמה' };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
      <ForgotPasswordForm />
    </div>
  );
}
