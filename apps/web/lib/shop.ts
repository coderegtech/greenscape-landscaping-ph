import 'server-only';
import type { CatalogQuery } from '@greenscape/validation';
import { CmsUnavailable } from './cms';

// Catalogue reads: cached by Next and tagged, so a product save in the admin revalidates exactly those pages.
// Stock is never part of these responses; the product page asks for it live from the browser.
const API = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ShopImage { url: string; alt: string; width: number | null; height: number | null; blurDataUrl: string | null }
export interface ProductCard { slug: string; name: string; scientificName: string | null; category: string; plantType: string | null; isNew: boolean; isFeatured: boolean; isBestSeller: boolean; image: ShopImage | null; priceFrom: string | null; compareAt: string | null; priceVaries: boolean }
export interface Variant { id: string; sku: string; name: string; attributes: Record<string, string>; price: string; compareAtPrice: string | null; trackInventory: boolean }
type Doc = { type: 'doc'; content: never[] };
export interface Product {
  id: string; slug: string; name: string; scientificName: string | null; nativeName: string | null; category: string; categoryLabel: string; plantType: string | null; plantTypeLabel: string | null;
  isNew: boolean; isFeatured: boolean; isBestSeller: boolean; images: ShopImage[]; variants: Variant[];
  content: { description?: Doc; careInstructions?: Doc; wateringFrequency?: string; sizesNote?: string } | null;
}

async function get<T>(path: string, tags: string[]): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API()}/v1/shop${path}`, { next: { revalidate: 300, tags }, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new CmsUnavailable(`shop unreachable: ${(err as Error).message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new CmsUnavailable(`shop ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const shop = {
  categories: () => get<{ slug: string; name: string; count: number }[]>('/categories', ['shop:catalog']).then((x) => x ?? []),
  products: (q: Partial<CatalogQuery>) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    return get<{ items: ProductCard[]; page: number; pageSize: number; total: number }>(`/products?${p}`, ['shop:catalog']).then((x) => x ?? { items: [], page: 1, pageSize: 24, total: 0 });
  },
  product: (slug: string) => get<Product>(`/products/${slug}`, ['shop:catalog', `shop:product:${slug}`]),
};
