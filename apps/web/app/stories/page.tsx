import { MasonryGrid } from '@greenscape/ui/components/masonry';
import { ArticleTile } from '@/components/cards';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('stories', '/stories');

export default async function StoriesPage() {
  // A few dozen stories at most (the API caps lists at 100): one static page, images load lazily as they scroll in.
  const stories = await cms.articles({ topic: 'story', limit: 100 });
  return (
    <CmsPageView slug="stories">
      <section aria-label="Stories" className="container-page pb-24">
        <MasonryGrid label="Story list">
          {stories.map((a, i) => (
            <ArticleTile key={a.slug} a={a} index={i} />
          ))}
        </MasonryGrid>
      </section>
    </CmsPageView>
  );
}
