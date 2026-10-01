import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

// The AM Technexus / agency login. One admin can manage many client businesses.
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per client business added from the admin home page.
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(), // used in the customer-facing QR URL: /r/[slug]
  // Secret token for the business-facing "manage questions" QR: /q/[manageToken]
  manageToken: text("manage_token").unique(),
  name: text("name").notNull(),
  address: text("address"),
  category: text("category"),
  description: text("description"),
  // Short bullets the AI rotates through for variety (3–5 items)
  reviewThemes: jsonb("review_themes").$type<string[]>(),
  logoUrl: text("logo_url"), // stored externally (R2 / any image host), we just keep the URL
  googlePlaceId: text("google_place_id"), // needed to build the "write a review" deep link
  // Optional management WhatsApp (digits with country code). Used for negative-review deep links.
  whatsappNumber: text("whatsapp_number"),
  // When false, customer QR / review flow is blocked (admin billing control).
  enabled: boolean("enabled").notNull().default(true),
  // How this business pays: "manual" (admin only) or "razorpay" (Questions QR checkout).
  billingMode: text("billing_mode").notNull().default("manual"),
  // Yearly Razorpay price in INR (1500 or 2500). Ignored for manual billing.
  razorpayYearlyAmount: integer("razorpay_yearly_amount").notNull().default(2500),
  // Legacy unused column (kept so existing DBs don't need a drop).
  billingBypass: boolean("billing_bypass").notNull().default(false),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  razorpaySubscriptionStatus: text("razorpay_subscription_status"),
  // End of current paid period (from Razorpay charge / subscription).
  paidUntil: timestamp("paid_until"),
  // When set, backlog refill should not retry Gemini until this time (API failure cooldown).
  backlogRefillAfter: timestamp("backlog_refill_after"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Up to 10 questions per business. Only "active" ones are eligible to be drawn.
export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  // "text" | "rating" | "multiple_choice" | "dropdown"
  type: text("type").notNull().default("text"),
  // Only used for "multiple_choice" and "dropdown" questions.
  options: jsonb("options").$type<string[]>(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  // When true, this question is always included in the customer review flow.
  // At most one active question per business should have this set.
  alwaysAsk: boolean("always_ask").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per customer session: which questions were shown, their answers,
// and the drafted review text. Useful for the business to see history /
// catch bad-sentiment sessions before they ever reach Google.
export const reviewSessions = pgTable("review_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  questionIds: jsonb("question_ids").notNull().$type<string[]>(),
  answers: jsonb("answers").notNull().$type<Record<string, string>>(),
  draftText: text("draft_text"),
  sentiment: text("sentiment"), // "positive" | "neutral" | "negative"
  // Set when the customer clicks Post / Open Google review (not confirmed Google submit).
  postedAt: timestamp("posted_at"),
  // Set when the customer clicks the private WhatsApp path.
  whatsappClickedAt: timestamp("whatsapp_clicked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Pre-generated review drafts per business (positive / neutral / negative).
// Used when live Gemini drafting fails. Target: 5 ready drafts total.
export const reviewBacklog = pgTable("review_backlog", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  draftText: text("draft_text").notNull(),
  sentiment: text("sentiment").notNull(), // "positive" | "neutral" | "negative"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per Gemini API call (every attempt, including failed ones — they can still bill).
export const geminiUsage = pgTable("gemini_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  // No FK: the usage row is written before the review session row exists.
  sessionId: uuid("session_id"),
  requestId: uuid("request_id"),
  purpose: text("purpose").notNull(), // "live_draft" | "backlog"
  model: text("model").notNull(),
  thinkingLevel: text("thinking_level"),
  promptTokens: integer("prompt_tokens"),
  outputTokens: integer("output_tokens"),
  thoughtTokens: integer("thought_tokens"),
  cachedTokens: integer("cached_tokens"),
  totalTokens: integer("total_tokens"),
  // USD at the paid-tier price in effect when the call was made (see lib/geminiPricing.ts).
  costUsd: numeric("cost_usd", { precision: 12, scale: 8 }),
  latencyMs: integer("latency_ms"),
  ok: boolean("ok").notNull(),
  finishReason: text("finish_reason"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Customer-flow / API failures surfaced on the admin Errors dashboard.
export const appErrors = pgTable("app_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  slug: text("slug"),
  source: text("source").notNull(), // e.g. review_questions_client | review_questions_api
  message: text("message").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
