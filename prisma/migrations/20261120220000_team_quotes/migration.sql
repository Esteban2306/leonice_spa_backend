CREATE TABLE "team_quotes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "source_text" TEXT NOT NULL,
    "quoted_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "reservation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "team_quotes_phone_idx" ON "team_quotes"("phone");

CREATE UNIQUE INDEX "team_quotes_phone_treatment_id_key" ON "team_quotes"("phone", "treatment_id");

ALTER TABLE "team_quotes" ADD CONSTRAINT "team_quotes_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
