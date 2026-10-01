/**
 * Safe schema patches when drizzle-kit push fails on Neon.
 * Usage: DATABASE_URL=... node scripts/db-patch.mjs
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const sql = neon(url);

function randomToken() {
  return randomBytes(18).toString("base64url");
}

async function main() {
  console.log("Adding category, description, and review_themes columns…");
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS category text`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS description text`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS review_themes jsonb`;

  console.log("Backfilling missing manage_token values…");
  const missing = await sql`
    SELECT id FROM businesses WHERE manage_token IS NULL
  `;
  for (const row of missing) {
    const token = randomToken();
    await sql`
      UPDATE businesses SET manage_token = ${token} WHERE id = ${row.id}
    `;
  }

  console.log("Adding manage_token unique constraint if missing…");
  const existing = await sql`
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'businesses_manage_token_unique'
      AND n.nspname = 'public'
  `;
  const constraint = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'businesses_manage_token_unique'
  `;
  if (existing.length === 0 && constraint.length === 0) {
    await sql`
      ALTER TABLE businesses
      ADD CONSTRAINT businesses_manage_token_unique UNIQUE (manage_token)
    `;
    console.log("Unique constraint added.");
  } else {
    console.log("manage_token unique index/constraint already exists — skipped.");
  }

  console.log("Adding whatsapp_number column…");
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp_number text`;

  console.log("Adding enabled column on businesses…");
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true`;

  console.log("Adding billing columns on businesses…");
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'manual'`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_bypass boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS razorpay_subscription_id text`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS razorpay_subscription_status text`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS paid_until timestamp`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS razorpay_yearly_amount integer NOT NULL DEFAULT 2500`;

  console.log("Adding always_ask column on questions…");
  await sql`ALTER TABLE questions ADD COLUMN IF NOT EXISTS always_ask boolean NOT NULL DEFAULT false`;

  console.log("Adding review session click-tracking columns…");
  await sql`ALTER TABLE review_sessions ADD COLUMN IF NOT EXISTS posted_at timestamp`;
  await sql`ALTER TABLE review_sessions ADD COLUMN IF NOT EXISTS whatsapp_clicked_at timestamp`;

  console.log("Adding backlog_refill_after on businesses…");
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS backlog_refill_after timestamp`;

  console.log("Creating review_backlog table if missing…");
  await sql`
    CREATE TABLE IF NOT EXISTS review_backlog (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      draft_text text NOT NULL,
      sentiment text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS review_backlog_business_sentiment_idx
    ON review_backlog (business_id, sentiment)
  `;

  console.log("Creating app_errors table if missing…");
  await sql`
    CREATE TABLE IF NOT EXISTS app_errors (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
      slug text,
      source text NOT NULL,
      message text NOT NULL,
      detail text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS app_errors_created_at_idx
    ON app_errors (created_at DESC)
  `;

  console.log("Creating gemini_usage table if missing…");
  await sql`
    CREATE TABLE IF NOT EXISTS gemini_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
      session_id uuid,
      request_id uuid,
      purpose text NOT NULL,
      model text NOT NULL,
      thinking_level text,
      prompt_tokens integer,
      output_tokens integer,
      thought_tokens integer,
      cached_tokens integer,
      total_tokens integer,
      cost_usd numeric(12, 8),
      latency_ms integer,
      ok boolean NOT NULL,
      finish_reason text,
      error text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gemini_usage_created_at_idx
    ON gemini_usage (created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS gemini_usage_business_created_idx
    ON gemini_usage (business_id, created_at DESC)
  `;

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
