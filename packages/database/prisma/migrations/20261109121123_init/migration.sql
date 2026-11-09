-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'ADJUST', 'SALE', 'RESERVE', 'RELEASE', 'RETURN', 'DAMAGE');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('OPEN', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('UNFULFILLED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('NEW', 'CONTACTED', 'SITE_VISIT', 'QUOTED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'PROBATION', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OPEN', 'PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'INCOMPLETE', 'APPROVED');

-- CreateEnum
CREATE TYPE "PunchType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarPath" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedBy" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "label" TEXT,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "barangay" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scientificName" TEXT,
    "nativeName" TEXT,
    "plantType" TEXT,
    "categoryId" UUID NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLevel" (
    "variantId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockAt" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLevel_pkey" PRIMARY KEY ("variantId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "orderId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "customerId" UUID,
    "anonToken" TEXT,
    "status" "CartStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "fulfillment" "FulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT true,
    "rawLast" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "providerRef" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "services" TEXT[],
    "projectLocation" TEXT,
    "preferredDate" DATE,
    "bestTimeToTalk" TEXT,
    "budgetRange" TEXT,
    "details" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" UUID,
    "legacyId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationAttachment" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,

    CONSTRAINT "QuotationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationNote" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "customerUserId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastMessageAt" TIMESTAMP(3),
    "unreadForStaff" INTEGER NOT NULL DEFAULT 0,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInquiry" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT,
    "checksum" TEXT,
    "uploadedById" UUID,
    "refCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "employeeNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "position" TEXT,
    "departmentId" UUID,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hiredOn" DATE,
    "photoMediaId" UUID,
    "managerId" UUID,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "isFlexible" BOOLEAN NOT NULL DEFAULT false,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleShift" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduleShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePunch" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "type" "PunchType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "photoMediaId" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "ip" TEXT,

    CONSTRAINT "TimePunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDaysPerYear" DECIMAL(5,2) NOT NULL,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allotted" DECIMAL(5,2) NOT NULL,
    "used" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "attachmentMediaId" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "expiresAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_legacyId_key" ON "Product"("legacyId");

-- CreateIndex
CREATE INDEX "Product_status_isFeatured_idx" ON "Product"("status", "isFeatured");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_idx" ON "Product"("categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_anonToken_key" ON "Cart"("anonToken");

-- CreateIndex
CREATE INDEX "Cart_customerId_status_idx" ON "Cart"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_customerId_placedAt_idx" ON "Order"("customerId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_status_placedAt_idx" ON "Order"("status", "placedAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRef_key" ON "Refund"("providerRef");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_legacyId_key" ON "Quotation"("legacyId");

-- CreateIndex
CREATE INDEX "Quotation_status_submittedAt_idx" ON "Quotation"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Quotation_email_idx" ON "Quotation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_legacyId_key" ON "Conversation"("legacyId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_customerUserId_idx" ON "Conversation"("customerUserId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_refCount_createdAt_idx" ON "MediaAsset"("refCount", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_bucket_path_key" ON "MediaAsset"("bucket", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_legacyId_key" ON "Employee"("legacyId");

-- CreateIndex
CREATE INDEX "ScheduleShift_scheduleId_weekday_idx" ON "ScheduleShift"("scheduleId", "weekday");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_employeeId_effectiveFrom_idx" ON "ScheduleAssignment"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workDate_status_idx" ON "AttendanceRecord"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_workDate_key" ON "AttendanceRecord"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "TimePunch_recordId_at_idx" ON "TimePunch"("recordId", "at");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_status_idx" ON "AttendanceCorrection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_key_key" ON "LeaveType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_legacyId_key" ON "LeaveRequest"("legacyId");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_idx" ON "LeaveRequest"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLevel" ADD CONSTRAINT "InventoryLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAttachment" ADD CONSTRAINT "QuotationAttachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAttachment" ADD CONSTRAINT "QuotationAttachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationNote" ADD CONSTRAINT "QuotationNote_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleShift" ADD CONSTRAINT "ScheduleShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written constraints Prisma can't express
ALTER TABLE "InventoryLevel"
  ADD CONSTRAINT "InventoryLevel_quantities_check"
  CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_check" CHECK ("price" >= 0);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_dates_check" CHECK ("endDate" >= "startDate" AND "days" > 0);
ALTER TABLE "ScheduleShift" ADD CONSTRAINT "ScheduleShift_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
