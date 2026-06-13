import { ResetPasswordForm } from '@/components/AuthForms';

export const metadata = { title: 'הגדרת סיסמה חדשה' };

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : '';
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
      <ResetPasswordForm token={token} />
    </div>
  );
}
