import { SignOutButton } from '@greenscape/ui/auth-forms';
import { PageHeader } from '@greenscape/ui/layout/dashboard';
import { Bell, ChevronRight, KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSchedule, portal } from '@/lib/portal';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

const rowLink = 'press flex min-h-14 items-center gap-3 px-4 text-sm font-semibold text-ink no-underline hover:bg-paper-2';

// What HR holds about the employee is shown, not edited, here: names, numbers and schedules change through HR.
export default async function ProfilePage() {
  const p = await portal();
  if (!p.ok) return null;
  const { employee } = p.today;
  const schedule = (await getSchedule().catch(() => [])).find((d) => d.schedule)?.schedule;
  const initials = employee.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('');
  const facts: [string, string][] = [['Employee number', employee.employeeNo], ['Work email', p.email], ['Work schedule', schedule ? schedule.name : 'Not assigned yet']];

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader level={1} title="Profile" />

      <section aria-label="Your details" className="card-in overflow-clip rounded-card border border-rule bg-paper-3 shadow-soft">
        <div className="tone-green flex items-center gap-4 bg-(--tone-soft) p-5">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-signal text-xl font-bold text-signal-ink">{initials}</span>
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-xl font-bold text-ink">{employee.name}</p>
            <p className="text-sm text-(--tone-ink)">Greenscape employee</p>
          </div>
        </div>
        <dl className="flex flex-col px-5" data-testid="profile-facts">
          {facts.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3 last:border-b-0">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="min-w-0 text-sm font-semibold break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-sm text-muted">Something wrong with your details? Tell HR: they keep employee records.</p>

      <nav aria-label="Account" className="flex flex-col divide-y divide-rule overflow-clip rounded-card border border-rule bg-paper-3 shadow-soft">
        <Link href="/notifications" className={rowLink}>
          <span aria-hidden className="tone-purple grid size-9 place-items-center rounded-xl bg-(--tone-soft) text-(--tone-ink)"><Bell className="size-[1.125rem]" /></span>
          <span className="flex-1">Notifications and sounds</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </Link>
        <a href={`${process.env.WEB_URL ?? 'http://localhost:3000'}/auth/forgot-password`} className={rowLink}>
          <span aria-hidden className="tone-blue grid size-9 place-items-center rounded-xl bg-(--tone-soft) text-(--tone-ink)"><KeyRound className="size-[1.125rem]" /></span>
          <span className="flex-1">Change your password</span>
          <ChevronRight aria-hidden className="size-4 text-muted" />
        </a>
      </nav>

      <SignOutButton />
    </div>
  );
}
