CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "treatment_name" TEXT NOT NULL,
    "before_image_url" TEXT,
    "before_image_public_id" TEXT,
    "after_image_url" TEXT,
    "after_image_public_id" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "consent_confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "testimonials_is_published_display_order_idx" ON "testimonials"("is_published", "display_order");

ALTER TABLE "testimonials"
  ADD CONSTRAINT "testimonials_author_name_check" CHECK (char_length("author_name") BETWEEN 2 AND 60),
  ADD CONSTRAINT "testimonials_quote_check" CHECK (char_length("quote") BETWEEN 10 AND 500),
  ADD CONSTRAINT "testimonials_treatment_name_check" CHECK (char_length("treatment_name") BETWEEN 2 AND 80),
  ADD CONSTRAINT "testimonials_before_image_pair_check" CHECK (("before_image_url" IS NULL) = ("before_image_public_id" IS NULL)),
  ADD CONSTRAINT "testimonials_after_image_pair_check" CHECK (("after_image_url" IS NULL) = ("after_image_public_id" IS NULL));
