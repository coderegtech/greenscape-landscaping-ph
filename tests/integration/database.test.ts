import { createPrismaClient } from '@greenscape/database';
import { afterAll, describe, expect, it } from 'vitest';

const db = createPrismaClient(process.env.DATABASE_URL!);
const tag = `itest-${process.pid}-${Date.now()}`;

afterAll(async () => {
  await db.product.deleteMany({ where: { slug: { startsWith: tag } } });
  await db.category.deleteMany({ where: { slug: tag } });
  await db.$disconnect();
});

describe('database constraints', () => {
  it('blocks reserving more stock than is on hand', async () => {
    const category = await db.category.create({ data: { slug: tag, name: 'Test' } });
    const product = await db.product.create({
      data: {
        slug: `${tag}-palm`,
        name: 'Areca Palm',
        categoryId: category.id,
        variants: { create: { sku: `${tag}-SKU`, name: '3 gal', price: '1250.00', inventory: { create: { onHand: 2 } } } },
      },
      include: { variants: true },
    });
    const variantId = product.variants[0]!.id;
    await expect(db.inventoryLevel.update({ where: { variantId }, data: { reserved: 2 } })).resolves.toMatchObject({ reserved: 2 });
    await expect(db.inventoryLevel.update({ where: { variantId }, data: { reserved: 3 } })).rejects.toThrow(/InventoryLevel_quantities_check/);
    await expect(db.inventoryLevel.update({ where: { variantId }, data: { onHand: -1 } })).rejects.toThrow(/InventoryLevel_quantities_check/);
  });

  it('rejects negative prices and duplicate SKUs', async () => {
    const category = await db.category.findUniqueOrThrow({ where: { slug: tag } });
    const p = await db.product.create({ data: { slug: `${tag}-fern`, name: 'Fern', categoryId: category.id } });
    await expect(db.productVariant.create({ data: { productId: p.id, sku: `${tag}-NEG`, name: 'x', price: '-1' } })).rejects.toThrow(/ProductVariant_price_check/);
    await expect(db.productVariant.create({ data: { productId: p.id, sku: `${tag}-SKU`, name: 'dup', price: '1' } })).rejects.toMatchObject({ code: 'P2002' });
  });
});
