import { createSupabaseServerClient } from '@greenscape/auth/next';
import { Button } from '@greenscape/ui/components/button';
import { Section } from '@greenscape/ui/layout/primitives';
import Link from 'next/link';
import { TestimonialCard } from '@/components/cards';
import { FeedbackForm } from '@/components/feedback-form';
import { cms } from '@/lib/cms';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

export const generateMetadata = () => pageMetadata('testimonials', '/testimonials');

export default async function TestimonialsPage() {
  const [page, items, { data }] = await Promise.all([loadPage('testimonials'), cms.testimonials(100), (await createSupabaseServerClient()).auth.getClaims()]);
  return (
    <main id="main">
      <PageHeader title={page.title} lead={page.lead} decor="testimonials" />
      <section aria-label="Client feedback" className="container-page pb-16">
        <div className={`grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-2 ${items.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
          {items.map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </div>
      </section>
      <Section band="deep" id="share" labelledBy="share-title">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3">
            <h2 id="share-title" className="text-3xl md:text-4xl">Worked with us?</h2>
            <p className="text-lg">Tell others how it went. We publish feedback after a quick review.</p>
          </div>
          {data ? (
            <FeedbackForm />
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-base text-ink-2">Sign in so we can confirm the feedback comes from a client.</p>
              <Button asChild>
                <Link href="/auth/login?next=%2Ftestimonials%23share" className="no-underline">Sign in to share feedback</Link>
              </Button>
            </div>
          )}
        </div>
      </Section>
    </main>
  );
}
