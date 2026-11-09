-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "accessKeyHash" TEXT,
ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'Palawan',
    "fee" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_sourceUrl_key" ON "MediaAsset"("sourceUrl");

-- CreateIndex
CREATE INDEX "Order_status_reservationExpiresAt_idx" ON "Order"("status", "reservationExpiresAt");


-- A zone can only be offered at checkout once it has a real, non-negative fee.
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_fee_check" CHECK (("fee" IS NULL OR "fee" >= 0) AND (NOT "isActive" OR "fee" IS NOT NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_check" CHECK ("subtotal" >= 0 AND "deliveryFee" >= 0 AND "discount" >= 0 AND "total" >= 0);
