import { Reveal } from '@greenscape/ui/motion/reveal';
import { ArticleCard } from '@/components/cards';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('stories', '/stories');

export default async function StoriesPage() {
  const stories = await cms.articles({ topic: 'story', limit: 100 });
  return (
    <CmsPageView slug="stories">
      <section aria-label="Stories" className="container-page pb-24">
        <div className="grid grid-cols-1 gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {stories.map((a, i) => (
            <Reveal key={a.slug} index={i % 3}>
              <ArticleCard a={a} priority={i < 3} />
            </Reveal>
          ))}
        </div>
      </section>
    </CmsPageView>
  );
}
