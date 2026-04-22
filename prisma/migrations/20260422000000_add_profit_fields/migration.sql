-- Migration: add profit fields (publicidad, ventas, ingresos)
-- Run in Supabase SQL Editor if applying manually

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "publicidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ventas"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ingresos"   DOUBLE PRECISION NOT NULL DEFAULT 0;

INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'manual', '20260422000000_add_profit_fields', NOW(), 1)
ON CONFLICT DO NOTHING;
