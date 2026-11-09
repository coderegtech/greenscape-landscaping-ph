import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('privacy', '/privacy');

export default function Page() {
  return <CmsPageView slug="privacy" />;
}
