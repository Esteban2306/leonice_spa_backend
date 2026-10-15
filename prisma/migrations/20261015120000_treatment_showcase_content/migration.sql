CREATE OR REPLACE FUNCTION pg_temp.leonice_slugify(value TEXT) RETURNS TEXT AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(lower(translate(value, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE "categories"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "icon_key" TEXT,
  ADD COLUMN "show_on_website" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "categories" SET "slug" = pg_temp.leonice_slugify("name");
UPDATE "categories" SET "slug" = "slug" || '-' || left("id", 8)
WHERE "slug" IN (SELECT "slug" FROM "categories" GROUP BY "slug" HAVING count(*) > 1);
ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

ALTER TABLE "treatments"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "ideal_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "results" TEXT,
  ADD COLUMN "aftercare" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "considerations" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "recommended_frequency" TEXT,
  ADD COLUMN "video_url" TEXT,
  ADD COLUMN "video_public_id" TEXT,
  ADD COLUMN "poster_url" TEXT,
  ADD COLUMN "content_needs_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "treatments" SET "slug" = pg_temp.leonice_slugify("name");
UPDATE "treatments" t SET "slug" = t."slug" || '-' || left(t."id", 8)
WHERE EXISTS (
  SELECT 1 FROM "treatments" o
  WHERE o."category_id" = t."category_id" AND o."slug" = t."slug" AND o."id" <> t."id"
);
ALTER TABLE "treatments" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "treatments_category_id_slug_key" ON "treatments"("category_id", "slug");

CREATE TABLE "treatment_steps" (
    "id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "treatment_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treatment_steps_treatment_id_position_key" ON "treatment_steps"("treatment_id", "position");

ALTER TABLE "treatment_steps" ADD CONSTRAINT "treatment_steps_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
