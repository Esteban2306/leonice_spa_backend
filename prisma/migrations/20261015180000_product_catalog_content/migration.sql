CREATE OR REPLACE FUNCTION pg_temp.leonice_slugify(value TEXT) RETURNS TEXT AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(lower(translate(value, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE "product_categories"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "icon_key" TEXT,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
UPDATE "product_categories" SET "slug" = pg_temp.leonice_slugify("name");
UPDATE "product_categories" c SET "slug" = c."slug" || '-' || left(c."id", 8)
WHERE EXISTS (SELECT 1 FROM "product_categories" o WHERE o."slug" = c."slug" AND o."id" <> c."id");
ALTER TABLE "product_categories" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

ALTER TABLE "product_tags" ADD COLUMN "slug" TEXT;
UPDATE "product_tags" SET "slug" = pg_temp.leonice_slugify("name");
UPDATE "product_tags" t SET "slug" = t."slug" || '-' || left(t."id", 8)
WHERE EXISTS (SELECT 1 FROM "product_tags" o WHERE o."slug" = t."slug" AND o."id" <> t."id");
ALTER TABLE "product_tags" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "product_tags_slug_key" ON "product_tags"("slug");

ALTER TABLE "products"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "how_to_use" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ideal_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "usage_frequency" TEXT,
  ADD COLUMN "precautions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "content_needs_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
UPDATE "products" SET "slug" = pg_temp.leonice_slugify("name");
UPDATE "products" p SET "slug" = p."slug" || '-' || left(p."id", 8)
WHERE EXISTS (SELECT 1 FROM "products" o WHERE o."slug" = p."slug" AND o."id" <> p."id");
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
