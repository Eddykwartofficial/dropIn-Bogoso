CREATE TABLE "driver_documents" (
	"id" serial PRIMARY KEY,
	"driver_id" text NOT NULL,
	"kind" text NOT NULL,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"user_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"vehicle_model" text NOT NULL,
	"vehicle_color" text NOT NULL,
	"plate" text NOT NULL,
	"licence_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"online" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"location_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY,
	"ride_id" integer NOT NULL,
	"reference" text NOT NULL,
	"event" text NOT NULL,
	"amount_pesewas" integer,
	"currency" text,
	"provider_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" serial PRIMARY KEY,
	"rider_id" text NOT NULL,
	"rider_name" text NOT NULL,
	"rider_phone" text NOT NULL,
	"rider_email" text NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"dropoff_address" text NOT NULL,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lng" double precision NOT NULL,
	"vehicle_type" text NOT NULL,
	"distance_km" double precision NOT NULL,
	"duration_min" integer NOT NULL,
	"fare" double precision NOT NULL,
	"commission_percent" double precision NOT NULL,
	"driver_earnings" double precision,
	"payment_method" text NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"paystack_reference" text UNIQUE,
	"paystack_url" text,
	"paid_at" timestamp,
	"status" text DEFAULT 'searching' NOT NULL,
	"driver_id" text,
	"declined_driver_ids" jsonb DEFAULT '[]' NOT NULL,
	"offered_at" timestamp,
	"accepted_at" timestamp,
	"arrived_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"cancelled_by" text,
	"cancel_reason" text,
	"rider_rating" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"base" double precision DEFAULT 8 NOT NULL,
	"per_km" double precision DEFAULT 3.5 NOT NULL,
	"per_minute" double precision DEFAULT 0.3 NOT NULL,
	"minimum" double precision DEFAULT 15 NOT NULL,
	"commission" double precision DEFAULT 15 NOT NULL,
	"search_radius_km" double precision DEFAULT 8 NOT NULL,
	"momo_enabled" boolean DEFAULT false NOT NULL,
	"accepting_rides" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "driver_documents_driver_idx" ON "driver_documents" ("driver_id");--> statement-breakpoint
CREATE INDEX "drivers_dispatch_idx" ON "drivers" ("status","online","vehicle_type");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_rider" ON "rides" ("rider_id") WHERE status in ('searching','offered','accepted','arrived','in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_driver" ON "rides" ("driver_id") WHERE driver_id is not null and status in ('offered','accepted','arrived','in_progress');--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" ("status");--> statement-breakpoint
CREATE INDEX "rides_driver_idx" ON "rides" ("driver_id");--> statement-breakpoint
CREATE INDEX "rides_rider_idx" ON "rides" ("rider_id");