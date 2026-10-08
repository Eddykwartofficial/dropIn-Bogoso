CREATE TABLE "demo_sessions" (
	"id" serial PRIMARY KEY,
	"token" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
