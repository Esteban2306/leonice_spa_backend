-- Integridad a nivel de base de datos: la aplicación ya valida estas reglas,
-- pero un fallo, un script manual o una carrera no deben poder dejar datos
-- imposibles. Cada CHECK se agrega NOT VALID y se valida enseguida para no
-- mantener un bloqueo largo sobre tablas grandes.

-- Reservas
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_time_range_chk" CHECK ("scheduled_end" > "scheduled_start") NOT VALID,
  ADD CONSTRAINT "reservations_final_price_chk" CHECK ("final_price" >= 0) NOT VALID,
  ADD CONSTRAINT "reservations_final_duration_chk" CHECK ("final_duration_minutes" > 0) NOT VALID;
ALTER TABLE "reservations" VALIDATE CONSTRAINT "reservations_time_range_chk";
ALTER TABLE "reservations" VALIDATE CONSTRAINT "reservations_final_price_chk";
ALTER TABLE "reservations" VALIDATE CONSTRAINT "reservations_final_duration_chk";

-- Depósitos
ALTER TABLE "deposit_records"
  ADD CONSTRAINT "deposit_records_amount_chk" CHECK ("amount" IS NULL OR "amount" > 0) NOT VALID;
ALTER TABLE "deposit_records" VALIDATE CONSTRAINT "deposit_records_amount_chk";

-- Un solo comprobante pendiente de revisión por reserva
CREATE UNIQUE INDEX "deposit_records_one_pending_per_reservation_idx"
  ON "deposit_records" ("reservation_id")
  WHERE "status" = 'PENDIENTE';

-- Cupos
ALTER TABLE "capacity_pools"
  ADD CONSTRAINT "capacity_pools_max_concurrent_chk" CHECK ("max_concurrent" >= 1) NOT VALID;
ALTER TABLE "capacity_pools" VALIDATE CONSTRAINT "capacity_pools_max_concurrent_chk";

-- Horario de atención y excepciones (minutos desde medianoche)
ALTER TABLE "operating_windows"
  ADD CONSTRAINT "operating_windows_day_chk" CHECK ("day_of_week" BETWEEN 0 AND 6) NOT VALID,
  ADD CONSTRAINT "operating_windows_range_chk" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute") NOT VALID;
ALTER TABLE "operating_windows" VALIDATE CONSTRAINT "operating_windows_day_chk";
ALTER TABLE "operating_windows" VALIDATE CONSTRAINT "operating_windows_range_chk";

ALTER TABLE "schedule_exceptions"
  ADD CONSTRAINT "schedule_exceptions_range_chk" CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR ("start_minute" IS NOT NULL AND "end_minute" IS NOT NULL
        AND "start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute")
  ) NOT VALID;
ALTER TABLE "schedule_exceptions" VALIDATE CONSTRAINT "schedule_exceptions_range_chk";

-- Catálogo y precios
ALTER TABLE "treatments"
  ADD CONSTRAINT "treatments_price_chk" CHECK (
    ("base_price_min" IS NULL OR "base_price_min" >= 0)
    AND ("base_price_max" IS NULL OR "base_price_max" >= 0)
    AND ("base_price_min" IS NULL OR "base_price_max" IS NULL OR "base_price_max" >= "base_price_min")
  ) NOT VALID,
  ADD CONSTRAINT "treatments_duration_chk" CHECK (
    ("base_duration_min_minutes" IS NULL OR "base_duration_min_minutes" > 0)
    AND ("base_duration_max_minutes" IS NULL OR "base_duration_max_minutes" > 0)
    AND ("base_duration_min_minutes" IS NULL OR "base_duration_max_minutes" IS NULL OR "base_duration_max_minutes" >= "base_duration_min_minutes")
  ) NOT VALID;
ALTER TABLE "treatments" VALIDATE CONSTRAINT "treatments_price_chk";
ALTER TABLE "treatments" VALIDATE CONSTRAINT "treatments_duration_chk";

ALTER TABLE "treatment_hair_length_pricing"
  ADD CONSTRAINT "treatment_hair_length_pricing_chk" CHECK ("price" >= 0 AND "duration_minutes" > 0) NOT VALID;
ALTER TABLE "treatment_hair_length_pricing" VALIDATE CONSTRAINT "treatment_hair_length_pricing_chk";

ALTER TABLE "treatment_hair_color_surcharge"
  ADD CONSTRAINT "treatment_hair_color_surcharge_chk" CHECK ("surcharge" >= 0 AND "extra_duration_minutes" >= 0) NOT VALID;
ALTER TABLE "treatment_hair_color_surcharge" VALIDATE CONSTRAINT "treatment_hair_color_surcharge_chk";

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_chk" CHECK ("price" >= 0) NOT VALID;
ALTER TABLE "product_variants" VALIDATE CONSTRAINT "product_variants_price_chk";

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_discount_chk" CHECK ("discount_percentage" > 0 AND "discount_percentage" <= 100) NOT VALID,
  ADD CONSTRAINT "promotions_period_chk" CHECK ("ends_at" > "starts_at") NOT VALID;
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_discount_chk";
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_period_chk";

-- Configuración, automatización, clientes y usuarios
ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_deposit_amount_chk" CHECK ("deposit_amount" IS NULL OR "deposit_amount" >= 0) NOT VALID;
ALTER TABLE "business_settings" VALIDATE CONSTRAINT "business_settings_deposit_amount_chk";

ALTER TABLE "automation_rules"
  ADD CONSTRAINT "automation_rules_days_chk" CHECK ("reactivation_days" > 0 AND ("reminder_days" IS NULL OR "reminder_days" > 0)) NOT VALID;
ALTER TABLE "automation_rules" VALIDATE CONSTRAINT "automation_rules_days_chk";

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_credit_balance_chk" CHECK ("credit_balance" >= 0) NOT VALID;
ALTER TABLE "clients" VALIDATE CONSTRAINT "clients_credit_balance_chk";

ALTER TABLE "users"
  ADD CONSTRAINT "users_counters_chk" CHECK ("failed_login_attempts" >= 0 AND "session_version" >= 0) NOT VALID;
ALTER TABLE "users" VALIDATE CONSTRAINT "users_counters_chk";

-- Índice de apoyo para consultas por tratamiento y para la clave foránea
CREATE INDEX "reservations_treatment_id_idx" ON "reservations"("treatment_id");
