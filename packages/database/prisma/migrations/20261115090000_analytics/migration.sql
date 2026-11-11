-- Cookieless website analytics: daily aggregate counters (no personal data).
CREATE TABLE "AnalyticsDaily" (
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("day","metric","key")
);
CREATE INDEX "AnalyticsDaily_metric_day_idx" ON "AnalyticsDaily"("metric", "day");
