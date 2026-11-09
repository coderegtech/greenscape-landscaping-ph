import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('about', '/about');

export default function Page() {
  return <CmsPageView slug="about" />;
}
