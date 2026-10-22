import CustomerReviewClient, {
  type BusinessInfo,
  type CustomerQuestion,
} from "./CustomerReviewClient";
import { isCustomerQrActive } from "@/lib/billing";
import { errorDetail, formatErrorDetail, logAppError } from "@/lib/errorLog";
import { pickQuestionCount, pickRandomQuestions } from "@/lib/reviewDraft";
import { loadBusinessQuestionPool } from "@/lib/reviewQuestions";

export const dynamic = "force-dynamic";

type PageData =
  | { error: string }
  | { business: BusinessInfo; questions: CustomerQuestion[] };

function renderError(slug: string, message: string) {
  return (
    <CustomerReviewClient
      slug={slug}
      business={null}
      questions={[]}
      initialError={message}
    />
  );
}

export default async function CustomerReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let pageData: PageData;

  try {
    const result = await loadBusinessQuestionPool(slug);
    if (!result) {
      pageData = { error: "Business not found" };
    } else {
      const { business, pool } = result;
      if (!isCustomerQrActive(business)) {
        pageData = { error: "This review link is currently unavailable." };
      } else if (pool.length === 0) {
        pageData = { error: "This business hasn't set up any questions yet" };
      } else {
        const picked = pickRandomQuestions(pool, pickQuestionCount(pool.length));
        const logoUrl = business.logoUrl
          ? business.logoUrl.startsWith("data:")
            ? `/api/review/logo?slug=${encodeURIComponent(business.slug)}`
            : business.logoUrl
          : null;
        pageData = {
          business: { name: business.name, logoUrl, slug: business.slug },
          questions: picked.map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type,
            options: q.options,
          })),
        };
      }
    }
  } catch (err) {
    console.error("GET /r/[slug] failed", err);
    void logAppError({
      source: "review_questions_page",
      message: "Could not load this review page. Please try again.",
      slug,
      detail: formatErrorDetail({
        stage: "questions_page_exception",
        error: errorDetail(err),
      }),
    });
    pageData = { error: "Could not load this review page. Please try again." };
  }

  if ("error" in pageData) return renderError(slug, pageData.error);
  return (
    <CustomerReviewClient
      slug={slug}
      business={pageData.business}
      questions={pageData.questions}
    />
  );
}
