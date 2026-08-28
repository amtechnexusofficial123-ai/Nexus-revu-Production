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

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
