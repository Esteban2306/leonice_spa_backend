ALTER TABLE "users" ADD COLUMN "previous_refresh_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "refresh_rotated_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
