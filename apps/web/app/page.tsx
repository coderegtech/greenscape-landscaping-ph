import { Button } from '@greenscape/ui/components/button';
import { PageHero } from '@greenscape/ui/layout/page-hero';
import Link from 'next/link';

// Phase 5 shell on the new design system. The CMS-driven home page replaces this in Phase 6.
export default function Home() {
  return (
    <main id="main">
      <PageHero
        title="Green today, greener tomorrow."
        lead="Garden design, landscaping and maintenance in Puerto Princesa, Palawan."
        actions={
          <>
            <Button asChild>
              <Link href="/quote" className="no-underline">Request a quote</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/shop" className="no-underline">Shop plants</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
