import Link from 'next/link';

export default function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-4">
      <div>
        <Link href="/admin" className="text-xs font-black text-red-800 hover:text-red-950">אדמין</Link>
        <p className="mt-1 text-xs font-bold text-stone-500">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black text-stone-900">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
