import { ContactDetails } from '@/components/contact-details';
import { ContactForm } from '@/components/contact-form';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('contact', '/contact');

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject } = await searchParams;
  const page = await loadPage('contact');
  return (
    <main id="main">
      <PageHeader title={page.title} lead={page.lead} />
      <div className="container-page grid grid-cols-1 gap-16 pb-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="find-us" className="flex flex-col gap-6 border-t-[1.5px] border-signal pt-6">
          <h2 id="find-us" className="text-2xl">Find us</h2>
          <ContactDetails />
        </section>
        <section aria-labelledby="write" className="flex flex-col gap-6 border-t border-rule pt-6">
          <h2 id="write" className="text-2xl">Send a message</h2>
          <ContactForm subject={typeof subject === 'string' ? subject : undefined} />
        </section>
      </div>
    </main>
  );
}
