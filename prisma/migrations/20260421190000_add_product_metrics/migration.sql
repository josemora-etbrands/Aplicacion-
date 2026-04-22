-- Migration: add metrics columns to products table (velocidad, margen, acos, semanas)
-- Run this AFTER 20260421180000_add_core_models if products table already exists
-- OR apply full migration if starting fresh

-- Add new columns to products (idempotent with IF NOT EXISTS)
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "margenPct"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "acos"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "precioVenta"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "velocidadInicial" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
  ADD COLUMN IF NOT EXISTS "velocidadMadura"  DOUBLE PRECISION NOT NULL DEFAULT 4.7,
  ADD COLUMN IF NOT EXISTS "w13"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "w14"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "w15"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "w16"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "w17"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nota"             TEXT;

-- Rename metaInicial/metaMadura if they exist from previous migration
-- (Only needed if upgrading from schema v1)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='metaInicial') THEN
    UPDATE "products" SET "velocidadInicial" = "metaInicial", "velocidadMadura" = "metaMadura";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "metaInicial";
    ALTER TABLE "products" DROP COLUMN IF EXISTS "metaMadura";
  END IF;
END $$;

-- Register migration
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'manual', '20260421190000_add_product_metrics', NOW(), 1)
ON CONFLICT DO NOTHING;
