import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
