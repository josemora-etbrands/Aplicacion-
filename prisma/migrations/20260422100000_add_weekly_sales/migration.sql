-- Migration: add weekly_sales table for dynamic week history
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "weekly_sales" (
  "id"        TEXT             NOT NULL,
  "productId" TEXT             NOT NULL,
  "year"      INTEGER          NOT NULL,
  "week"      INTEGER          NOT NULL,
  "value"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "weekly_sales_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "weekly_sales_productId_fkey"   FOREIGN KEY ("productId")
    REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_sales_productId_year_week_key"
  ON "weekly_sales"("productId", "year", "week");

INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'manual', '20260422100000_add_weekly_sales', NOW(), 1)
ON CONFLICT DO NOTHING;
