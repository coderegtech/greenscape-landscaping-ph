import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('delivery-policy', '/delivery-policy');

export default function Page() {
  return <CmsPageView slug="delivery-policy" />;
}
