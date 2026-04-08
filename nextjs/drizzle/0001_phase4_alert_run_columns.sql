ALTER TABLE "alerts" ADD COLUMN "last_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_result" text;