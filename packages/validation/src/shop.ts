// Shop contracts: catalogue queries, cart, checkout, and the admin product/stock/order forms.
// Money travels as strings with two decimals ("1250.00"); all arithmetic happens server-side in Decimal.
import { z } from 'zod';
import { Email, PhPhone } from './primitives.ts';

export const SHOP_CATEGORIES = { plants: 'Plants', soil: 'Soil and fertilizers', hardscape: 'Hardscape', tools: 'Tools', accessories: 'Accessories' } as const;
export const PLANT_TYPES = {
  trees: 'Trees', shrubs: 'Shrubs', grass: 'Grass', 'palms-cycads': 'Palms and cycads', 'vines-climbers': 'Vines and climbers',
  ferns: 'Ferns', 'indoor-shade': 'Indoor and shade', 'water-wetland': 'Water and wetland',
} as const;
export const CATALOG_SORTS = { featured: 'Featured', newest: 'Newest', 'price-asc': 'Price, low to high', 'price-desc': 'Price, high to low', name: 'Name' } as const;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes').max(100);
export const Money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Enter an amount like 1250 or 1250.50');

export const CatalogQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(keys(SHOP_CATEGORIES)).optional(),
  plantType: z.enum(keys(PLANT_TYPES)).optional(),
  flag: z.enum(['new', 'featured', 'bestseller']).optional(),
  sort: z.enum(keys(CATALOG_SORTS)).default('featured'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type CatalogQuery = z.infer<typeof CatalogQuery>;

export const MAX_LINE_QTY = 99;
export const CartLineInput = z.object({ variantId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(MAX_LINE_QTY) });
export const CartQtyInput = z.object({ quantity: z.coerce.number().int().min(0).max(MAX_LINE_QTY) });

export const CheckoutForm = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: Email,
  phone: PhPhone,
  line1: z.string().trim().min(3, 'Enter the street, building or sitio').max(160),
  line2: z.string().trim().max(160).optional().or(z.literal('').transform(() => undefined)),
  barangay: z.string().trim().min(2, 'Enter the barangay').max(80),
  zoneId: z.string().uuid('Choose your municipality'),
  postalCode: z.string().trim().regex(/^\d{4}$/, 'Four digits').optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
  consent: z.literal(true, { error: 'Please accept the Privacy Notice and delivery terms to continue' }),
  website: z.string().max(500).optional(),
});
export type CheckoutForm = z.infer<typeof CheckoutForm>;
export type CheckoutFormInput = z.input<typeof CheckoutForm>;
/** The idempotency key makes a double-submitted checkout create one order, not two. */
export const CheckoutRequest = CheckoutForm.extend({ idempotencyKey: z.string().uuid() });

export const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: 'Waiting for payment', PAID: 'Paid', CANCELLED: 'Cancelled', REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded', COMPLETED: 'Completed',
} as const;
export const FULFILLMENT_LABELS = { UNFULFILLED: 'Not yet prepared', PREPARING: 'Being prepared', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', RETURNED: 'Returned' } as const;
export type OrderStatus = keyof typeof ORDER_STATUS_LABELS;
export type FulfillmentStatus = keyof typeof FULFILLMENT_LABELS;

// ── admin ──
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED'] as const;
export const ProductInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: Slug,
  scientificName: z.string().trim().max(120).nullish(),
  nativeName: z.string().trim().max(120).nullish(),
  category: z.enum(keys(SHOP_CATEGORIES)),
  plantType: z.enum(keys(PLANT_TYPES)).nullish(),
  status: z.enum(PRODUCT_STATUSES),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  images: z.array(z.object({ mediaId: z.string().uuid(), alt: z.string().trim().max(200).nullish() })).max(12).default([]),
  // Marketing content (MongoDB productContent), plain text with blank-line paragraphs.
  description: z.string().trim().max(5000).default(''),
  careInstructions: z.string().trim().max(5000).default(''),
  wateringFrequency: z.string().trim().max(120).default(''),
  sizesNote: z.string().trim().max(200).default(''),
});
export type ProductInput = z.infer<typeof ProductInput>;

export const VariantInput = z.object({
  sku: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'Capital letters, numbers and dashes'),
  name: z.string().trim().min(1).max(80),
  attributes: z.record(z.string().max(40), z.string().max(80)).default({}),
  price: Money,
  compareAtPrice: Money.nullish(),
  isActive: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  lowStockAt: z.coerce.number().int().min(0).max(100000).default(5),
});
export type VariantInput = z.infer<typeof VariantInput>;

export const STOCK_ADJUST_TYPES = { RECEIVE: 'Received', ADJUST: 'Count correction', DAMAGE: 'Damaged or died', RETURN: 'Returned' } as const;
export const StockAdjust = z
  .object({ type: z.enum(keys(STOCK_ADJUST_TYPES)), quantity: z.coerce.number().int().min(-100000).max(100000), reason: z.string().trim().max(300).optional() })
  .refine((v) => v.quantity !== 0, { path: ['quantity'], message: 'Enter a quantity other than 0' })
  .refine((v) => v.type === 'ADJUST' || (v.type === 'DAMAGE' ? v.quantity < 0 : v.quantity > 0), { path: ['quantity'], message: 'Received and returned stock is positive; damaged stock is negative' });

export const FulfillmentUpdate = z.object({ fulfillment: z.enum(keys(FULFILLMENT_LABELS)), note: z.string().trim().max(500).optional() });
export const CancelRequest = z.object({ reason: z.string().trim().min(3).max(300) });
export const RefundRequest = z.object({ amount: Money, reason: z.string().trim().min(3).max(300), restock: z.boolean().default(false) });

export const ZoneInput = z.object({ name: z.string().trim().min(2).max(80), fee: Money.nullish(), isActive: z.boolean(), sortOrder: z.coerce.number().int().default(0) });

export const OrderListQuery = z.object({
  status: z.enum(keys(ORDER_STATUS_LABELS)).optional(),
  fulfillment: z.enum(keys(FULFILLMENT_LABELS)).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
