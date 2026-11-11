import { createSupabaseServerClient } from '@greenscape/auth/next';
import { QuoteForm } from '@/components/quote-form';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

export const generateMetadata = () => pageMetadata('quote', '/quote');

export default async function QuotePage() {
  const [page, { data }] = await Promise.all([loadPage('quote'), (await createSupabaseServerClient()).auth.getClaims()]);
  return (
    <main id="main">
      <PageHeader title={page.title} lead={page.lead} decor="contact" />
      <div className="container-page pb-24">
        <div className="max-w-[52rem]">
          <QuoteForm signedIn={!!data} />
        </div>
      </div>
    </main>
  );
}
