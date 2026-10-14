CREATE TYPE "public"."entity_type" AS ENUM('product', 'category', 'color', 'material', 'brand');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."insight_kind" AS ENUM('observation', 'research', 'market_note', 'source_digest');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('api', 'retailer', 'editorial', 'social', 'analyst');--> statement-breakpoint
CREATE TYPE "public"."trend_attribute" AS ENUM('color', 'material', 'category');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"body" text NOT NULL,
	"cover_image_url" text,
	"author_id" text,
	"category_id" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"reading_minutes" integer DEFAULT 5 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_trends" (
	"id" text PRIMARY KEY NOT NULL,
	"attribute" "trend_attribute" NOT NULL,
	"value" text NOT NULL,
	"month" date NOT NULL,
	"share" numeric(6, 4) NOT NULL,
	"avg_price_cents" integer NOT NULL,
	"product_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"min_tier" "user_tier" DEFAULT 'free' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" "ingestion_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"products_upserted" integer DEFAULT 0 NOT NULL,
	"price_points_upserted" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"quota" jsonb
);
--> statement-breakpoint
CREATE TABLE "insight_links" (
	"id" text PRIMARY KEY NOT NULL,
	"insight_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"source_id" text,
	"confidence" integer DEFAULT 3 NOT NULL,
	"signal" text,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"homepage" text
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"platform_id" text NOT NULL,
	"date" date NOT NULL,
	"lowest_ask_cents" integer NOT NULL,
	"highest_bid_cents" integer NOT NULL,
	"last_sale_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"brand_id" text NOT NULL,
	"category_id" text NOT NULL,
	"silhouette" text NOT NULL,
	"colorway" text NOT NULL,
	"primary_color" text NOT NULL,
	"secondary_color" text,
	"materials" text[] DEFAULT '{}'::text[] NOT NULL,
	"release_date" date NOT NULL,
	"retail_price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"image_url" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_points" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"platform_id" text NOT NULL,
	"date" date NOT NULL,
	"volume" integer NOT NULL,
	"avg_sale_cents" integer NOT NULL,
	"active_listings" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"kind" "source_kind" NOT NULL,
	"retrieved_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" "user_tier" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"window_days" integer NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"tier" "user_tier" DEFAULT 'free' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_links" ADD CONSTRAINT "insight_links_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_points" ADD CONSTRAINT "sales_points_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_points" ADD CONSTRAINT "sales_points_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "articles_status_published_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_trends_unique_idx" ON "attribute_trends" USING btree ("attribute","value","month");--> statement-breakpoint
CREATE INDEX "attribute_trends_month_idx" ON "attribute_trends" USING btree ("month");--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_links_unique_idx" ON "insight_links" USING btree ("insight_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "insight_links_entity_idx" ON "insight_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "insights_status_idx" ON "insights" USING btree ("status");--> statement-breakpoint
CREATE INDEX "insights_published_at_idx" ON "insights" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "insights_kind_idx" ON "insights" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "price_points_unique_idx" ON "price_points" USING btree ("product_id","platform_id","date");--> statement-breakpoint
CREATE INDEX "price_points_date_idx" ON "price_points" USING btree ("date");--> statement-breakpoint
CREATE INDEX "price_points_product_date_idx" ON "price_points" USING btree ("product_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_primary_color_idx" ON "products" USING btree ("primary_color");--> statement-breakpoint
CREATE INDEX "products_release_date_idx" ON "products" USING btree ("release_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_points_unique_idx" ON "sales_points" USING btree ("product_id","platform_id","date");--> statement-breakpoint
CREATE INDEX "sales_points_product_date_idx" ON "sales_points" USING btree ("product_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "trend_scores_unique_idx" ON "trend_scores" USING btree ("entity_type","entity_id","window_days");--> statement-breakpoint
CREATE INDEX "trend_scores_score_idx" ON "trend_scores" USING btree ("score");