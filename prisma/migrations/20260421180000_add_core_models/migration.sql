-- CreateEnum
CREATE TYPE "CategoriaPalanca" AS ENUM ('EXPOSICION', 'CONVERSION');

-- CreateEnum
CREATE TYPE "EjecutadoPor" AS ENUM ('USUARIO', 'IA');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "metaInicial" DOUBLE PRECISION NOT NULL,
    "metaMadura" DOUBLE PRECISION NOT NULL,
    "visitas" INTEGER NOT NULL DEFAULT 0,
    "ventasSemanales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posicionSEO" INTEGER,
    "calificacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "palancas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaPalanca" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "palancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_logs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "palancaId" TEXT NOT NULL,
    "ejecutadoPor" "EjecutadoPor" NOT NULL,
    "impacto" DOUBLE PRECISION,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_palancaId_fkey" FOREIGN KEY ("palancaId") REFERENCES "palancas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
