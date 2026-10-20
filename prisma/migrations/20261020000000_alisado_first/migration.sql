UPDATE "treatments" t
SET "display_order" = 0
FROM "categories" c
WHERE t."category_id" = c."id"
  AND c."slug" = 'spa-capilar'
  AND t."slug" = 'alisado';
