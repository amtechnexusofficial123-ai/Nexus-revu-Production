# NexusRevu

*By AM Technexus Labs*

QR-based review collection: a customer scans a table QR, answers 3–4 randomly
picked questions (out of up to 10 set by the business — open text, star rating,
multiple choice, or dropdown), gets a drafted review from their answers, and
finishes posting it on Google themselves.

Brand assets (`nexusrevu-mark.svg`, `nexusrevu-lockup.svg`) live in `/public`
and are already wired into the landing page, auth pages, dashboard nav, and
customer flow footer.

## Important: how the Google step actually works

There is no API for posting a review to Google on someone else's behalf —
a review can only be submitted by the real customer, logged into their own
Google account, on Google's own page. This app doesn't try to bypass that.
Instead it:

1. Drafts the review text from the customer's answers.
2. Copies that text to the customer's clipboard.
3. Opens Google's official "write a review" link for your business
   (`https://search.google.com/local/writereview?placeid=...`).
4. The customer pastes the text and hits submit themselves.

**Don't hide the Google step or the option to post from customers based on
how positive their answers were.** Filtering out unhappy customers while
funneling happy ones to Google ("review gating") violates Google's review
policies and, in the US, the FTC's rule against manipulating reviews. This
app always offers the same path to everyone; sentiment is only recorded
internally so you can spot an unhappy customer and follow up privately.

## Stack

- Next.js 15 (App Router), deployed to Cloudflare Workers via `@opennextjs/cloudflare`
- Neon Postgres (serverless HTTP driver — works on Cloudflare Workers)
- Drizzle ORM
- Template-based review drafting from customer answers (falls back when no AI key)
- Google Gemini (`GEMINI_API_KEY`, default `gemini-3.6-flash`) for varied AI-drafted reviews when configured
- `qrcode` npm package for QR generation
- Cookie + JWT (jose) sessions, bcrypt password hashing

## 1. Set up Neon

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the connection string into `DATABASE_URL` in `.env`.
3. Push the schema:
   ```bash
   npm install
   npm run db:push
   ```

## 2. Environment variables

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — from Neon
- `AUTH_SECRET` — `openssl rand -base64 32`
- `GEMINI_API_KEY` — optional, from [Google AI Studio](https://aistudio.google.com/apikey); when set, customer reviews are drafted with Gemini instead of templates

## 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, sign up as a business, add up to 10
questions, add your Google Place ID (find it with
[Google's Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id)),
and grab your QR from the dashboard.

## 4. Deploy to Cloudflare Pages (subdomain)

```bash
npm run cf:build
OPEN_NEXT_DEPLOY=true CI=true npx wrangler deploy
```

Then set Worker secrets:
```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put AUTH_SECRET
npx wrangler secret put GEMINI_API_KEY
```

Or in the Cloudflare dashboard: Workers → your project → Settings → Variables
and Secrets → add `DATABASE_URL`, `AUTH_SECRET`, and optionally `GEMINI_API_KEY`.

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "Initial ReviewFlow scaffold"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Consider hooking up Cloudflare Pages' Git integration instead of manual
`wrangler` deploys, so every push to `main` auto-deploys.

## Project structure

```
src/
  db/            Drizzle schema + Neon client
  lib/           auth, review drafting, QR + Google link helpers
  app/
    page.tsx             landing page
    login/ signup/        business auth
    dashboard/            business profile, logo, Google Place ID, QR
    dashboard/questions/  manage up to 10 questions
    r/[slug]/             customer-facing scan → answer → draft → Google flow
    api/                  all backend routes (edge runtime)
```

## Sending the QR to a business

The dashboard's QR is just an image (`/api/qr`) pointing at
`https://yourdomain/r/<business-slug>`. Download it and attach it to an
email/WhatsApp message, or extend `/api/qr` to send it directly via your
email provider's API.

## Not included yet (natural next steps)

- Logo upload (currently a URL field — wire up Cloudflare R2 + a signed
  upload endpoint if you want in-app upload instead of pasting a URL)
- Business-side analytics on `review_sessions` (sentiment over time, drop-off rate)
- Multi-user access per business (currently one login per business)
- Rate limiting on the public `/api/review/*` routes
