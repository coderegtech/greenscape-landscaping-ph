import { Reveal } from '@greenscape/ui/motion/reveal';
import { ServiceCard } from '@/components/cards';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('services', '/services');

export default async function ServicesPage() {
  const services = await cms.services();
  return (
    <CmsPageView slug="services">
      <section aria-label="Services" className="container-page pb-24">
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s, i) => (
            <Reveal key={s.slug} index={i} className="h-full">
              <ServiceCard s={s} index={i} />
            </Reveal>
          ))}
        </div>
      </section>
    </CmsPageView>
  );
}
