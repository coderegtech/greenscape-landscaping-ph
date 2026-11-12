import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@greenscape/ui/components/accordion';
import Link from 'next/link';
import { RichText } from '@/components/rich-text';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('faq', '/faq');

export default async function FaqPage() {
  const faqs = await cms.faqs();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer.content.flatMap((p) => p.content?.map((t) => t.text ?? '') ?? []).join(' ') },
    })),
  };
  return (
    <CmsPageView slug="faq">
      <section aria-label="Questions" className="container-page pb-24">
        <Accordion type="multiple" data-stagger="rise" className="max-w-[56rem] border-t-[1.5px] border-signal">
          {faqs.map((f) => (
            <AccordionItem key={f.question} value={f.question} className="border-rule">
              <AccordionTrigger className="py-6 font-display text-xl text-ink hover:no-underline md:text-2xl">{f.question}</AccordionTrigger>
              <AccordionContent className="pb-6">
                <RichText doc={f.answer} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-10 text-lg text-ink-2">
          Didn’t find your answer? <Link href="/contact">Contact us</Link> or <Link href="/quote">request a quote</Link>.
        </p>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      </section>
    </CmsPageView>
  );
}
