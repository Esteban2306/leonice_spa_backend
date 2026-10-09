UPDATE "treatments" AS t
SET "name" = 'Pedespa tradicional',
    "updated_at" = CURRENT_TIMESTAMP
FROM "categories" AS c
WHERE t."category_id" = c."id"
  AND c."name" = 'Uñas'
  AND t."name" = 'Pedespa'
  AND NOT EXISTS (
    SELECT 1
    FROM "treatments" AS existing
    WHERE existing."category_id" = c."id"
      AND existing."name" = 'Pedespa tradicional'
  );

INSERT INTO "treatments" (
  "id",
  "category_id",
  "name",
  "requires_prior_assessment",
  "base_price_min",
  "base_price_max",
  "base_duration_min_minutes",
  "base_duration_max_minutes",
  "is_active",
  "has_hair_variable_pricing",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  catalog."name",
  false,
  catalog."price",
  catalog."price",
  catalog."minutes",
  catalog."minutes",
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "categories" AS c
CROSS JOIN (
  VALUES
    ('Pedespa tradicional', 35, 90),
    ('Pedespa semipermanente', 55, 90),
    ('Permanente', 60, 90),
    ('Tradicional', 35, 90),
    ('Uñas Press On soft gel', 75, 150),
    ('Nivelación con base rubber', 65, 150),
    ('Uñas Dipping', 65, 150),
    ('Uñas Acrílicas', 100, 180)
) AS catalog("name", "price", "minutes")
WHERE c."name" = 'Uñas'
ON CONFLICT ("category_id", "name") DO UPDATE
SET "base_price_min" = EXCLUDED."base_price_min",
    "base_price_max" = EXCLUDED."base_price_max",
    "base_duration_min_minutes" = EXCLUDED."base_duration_min_minutes",
    "base_duration_max_minutes" = EXCLUDED."base_duration_max_minutes",
    "updated_at" = CURRENT_TIMESTAMP;
