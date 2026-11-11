import { api } from '@greenscape/auth/api';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Notice } from '@greenscape/ui/form';
import { FactList } from '@greenscape/ui/layout/primitives';
import { MeResponse, MyQuotation, QUOTATION_STATUS_LABELS, QUOTE_SERVICES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Addresses, DeleteAccount, ProfileForm, RemoveButton, type SavedAddress } from '@/components/account/account-client';
import { longDate } from '@/lib/cms';
import { peso } from '@/lib/money';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

const MyOrder = z.object({ number: z.string(), statusLabel: z.string(), fulfillmentLabel: z.string(), status: z.string(), total: z.string(), placedAt: z.string(), itemCount: z.number() });
const Profile = z.object({ email: z.string(), displayName: z.string().nullable(), avatarUrl: z.string().nullable(), phone: z.string().nullable(), memberSince: z.string() });
const Wish = z.object({ id: z.string(), slug: z.string(), name: z.string(), priceFrom: z.string().nullable() });
const Chat = z.object({ id: z.string(), title: z.string(), status: z.string(), updatedAt: z.string() });
const Inquiry = z.object({ id: z.string(), subject: z.string().nullable(), excerpt: z.string(), status: z.string(), replies: z.number(), sentAt: z.string() });
const INQUIRY_LABEL: Record<string, string> = { new: 'Received', replied: 'Replied', closed: 'Closed' };

// Profile, addresses, orders, quotes, wishlist, chats and messages. Every list comes from the API, scoped to this person.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, me, quotes, orders, profile, addresses, wishlist, chats, inquiries] = await Promise.all([
    searchParams,
    api('/v1/auth/me', MeResponse),
    api('/v1/quotations/mine', z.array(MyQuotation)),
    api('/v1/orders/mine', z.array(MyOrder)),
    api('/v1/me/profile', Profile),
    api('/v1/me/addresses', z.array(z.custom<SavedAddress>())),
    api('/v1/me/wishlist', z.array(Wish)),
    api('/v1/assistant/conversations', z.array(Chat)),
    api('/v1/me/inquiries', z.array(Inquiry)),
  ]);
  const staffAccount = me.roles.some((r) => r !== 'customer' && r !== 'employee');
  return (
    <main id="main" className="container-page py-16 md:py-24">
      <div className="mx-auto flex max-w-[48rem] flex-col gap-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google avatar from any host; small and decorative
              <img src={profile.avatarUrl} alt="" width={64} height={64} referrerPolicy="no-referrer" className="size-16 rounded-full border border-rule object-cover" data-testid="account-avatar" />
            ) : (
              <span aria-hidden className="inline-flex size-16 items-center justify-center rounded-full bg-paper-2 font-display text-2xl text-ink">{(profile.displayName ?? profile.email).slice(0, 1).toUpperCase()}</span>
            )}
            <div className="flex flex-col">
              <h1 className="text-display-s">My account</h1>
              <span className="text-base text-ink-2">Member since {longDate(profile.memberSince)}</span>
            </div>
          </div>
          <SignOutButton />
        </div>
        {reset && <Notice tone="success">Your password has been changed.</Notice>}
        <p className="text-lg">Questions? <Link href="/messages">Message us</Link> and we reply here and by email.</p>
        {me.roles.includes('employee') && (
          <p className="border-l-2 border-signal pl-4 text-lg">
            <a href={process.env.EMPLOYEE_URL ?? 'http://localhost:3002'}>Open the employee portal</a> to clock in and out and request leave (sign in with your work email and password).
          </p>
        )}
        <FactList
          items={[
            { term: 'Email', detail: <span data-testid="account-email">{me.user.email}</span> },
            { term: 'Account type', detail: <span data-testid="account-roles">{me.roles.join(', ')}</span> },
          ]}
        />
        <section aria-labelledby="details" className="flex flex-col gap-6">
          <h2 id="details" className="text-3xl">Your details</h2>
          <ProfileForm displayName={profile.displayName} phone={profile.phone} />
        </section>
        <section aria-labelledby="addresses" className="flex flex-col gap-6">
          <h2 id="addresses" className="text-3xl">Delivery addresses</h2>
          <Addresses addresses={addresses} />
        </section>
        <section aria-labelledby="orders" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="orders" className="text-3xl">Your orders</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/shop" className="no-underline">Shop</Link>
            </Button>
          </div>
          {orders.length ? (
            <ul className="border-t border-rule" data-testid="my-orders">
              {orders.map((o) => (
                <li key={o.number} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/orders/${o.number}`} className="figure text-lg text-ink">{o.number}</Link>
                    <span className="text-sm text-muted">{o.itemCount === 1 ? '1 item' : `${o.itemCount} items`}, {peso(o.total)}. Placed {longDate(o.placedAt)}</span>
                  </div>
                  <Badge variant={o.status === 'PAID' || o.status === 'COMPLETED' ? 'signal' : 'outline'}>{o.status === 'PAID' ? o.fulfillmentLabel : o.statusLabel}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">No orders yet.</p>
          )}
        </section>
        <section aria-labelledby="quotes" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="quotes" className="text-3xl">Your quote requests</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/quote" className="no-underline">New request</Link>
            </Button>
          </div>
          {quotes.length ? (
            <ul className="border-t border-rule" data-testid="my-quotes">
              {quotes.map((q) => (
                <li key={q.number} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="figure text-lg text-ink">{q.number}</span>
                    <span className="text-sm text-muted">
                      {q.services.map((s) => QUOTE_SERVICES[s as keyof typeof QUOTE_SERVICES] ?? s).join(', ')}
                      {q.projectLocation && `, ${q.projectLocation}`}. Sent {longDate(q.submittedAt)}
                    </span>
                  </div>
                  <Badge variant={q.status === 'NEW' ? 'outline' : 'signal'}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">No requests yet. When you ask for a quote while signed in, or with this email, it appears here.</p>
          )}
        </section>
        <section aria-labelledby="wishlist" className="flex flex-col gap-6">
          <h2 id="wishlist" className="text-3xl">Wishlist</h2>
          {wishlist.length ? (
            <ul className="border-t border-rule" data-testid="my-wishlist">
              {wishlist.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-4 border-b border-rule py-3">
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/shop/${w.slug}`} className="text-lg text-ink">{w.name}</Link>
                    {w.priceFrom && <span className="text-sm text-ink-2">From {peso(w.priceFrom)}</span>}
                  </div>
                  <RemoveButton path={`/me/wishlist/${w.id}`} label={`Remove ${w.name} from your wishlist`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">Nothing saved yet. Tap the heart on a plant in the <Link href="/shop">shop</Link> to keep it here.</p>
          )}
        </section>
        <section aria-labelledby="chats" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="chats" className="text-3xl">Chats with our AI assistant</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/account?intent=chat" className="no-underline">Open the chat</Link>
            </Button>
          </div>
          {chats.length ? (
            <ul className="border-t border-rule" data-testid="my-chats">
              {chats.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 border-b border-rule py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-lg text-ink">{c.title}</span>
                    <span className="text-sm text-ink-2">{longDate(c.updatedAt)}{c.status === 'escalated' ? ', passed to our team' : ''}</span>
                  </div>
                  <RemoveButton path={`/assistant/conversations/${c.id}`} label={`Delete the chat ${c.title}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">No chats yet. Your conversations with the assistant are saved here, and you can delete any of them.</p>
          )}
        </section>
        <section aria-labelledby="inquiries" className="flex flex-col gap-6">
          <h2 id="inquiries" className="text-3xl">Messages from the contact form</h2>
          {inquiries.length ? (
            <ul className="border-t border-rule" data-testid="my-inquiries">
              {inquiries.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-lg text-ink">{i.subject ?? i.excerpt.slice(0, 60)}</span>
                    <span className="text-sm text-ink-2">Sent {longDate(i.sentAt)}{i.replies ? `, ${i.replies === 1 ? '1 reply' : `${i.replies} replies`} by email` : ''}</span>
                  </div>
                  <Badge variant={i.status === 'new' ? 'outline' : 'signal'}>{INQUIRY_LABEL[i.status] ?? i.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">No messages yet. <Link href="/contact">Contact us</Link> any time.</p>
          )}
        </section>
        <section aria-labelledby="close" className="flex flex-col gap-4 border-t border-rule pt-8">
          <h2 id="close" className="text-2xl">Delete your account</h2>
          {staffAccount ? <p className="text-base text-ink-2">Staff accounts are closed by an administrator. Please ask your manager.</p> : <DeleteAccount />}
        </section>
      </div>
    </main>
  );
}
