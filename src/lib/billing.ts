export type BillingMode = "manual" | "razorpay";

/** Supported yearly subscription prices (INR). */
export const RAZORPAY_YEARLY_AMOUNTS = [1500, 2500] as const;
export type RazorpayYearlyAmount = (typeof RAZORPAY_YEARLY_AMOUNTS)[number];
export const DEFAULT_RAZORPAY_YEARLY_AMOUNT: RazorpayYearlyAmount = 2500;

export type BillingBusiness = {
  enabled: boolean;
  billingMode: string | null;
  razorpaySubscriptionId?: string | null;
  razorpaySubscriptionStatus: string | null;
  paidUntil: Date | string | null;
  razorpayYearlyAmount?: number | null;
};

const PAID_STATUSES = new Set(["active", "authenticated"]);

export function normalizeBillingMode(value: unknown): BillingMode {
  return value === "razorpay" ? "razorpay" : "manual";
}

export function normalizeRazorpayYearlyAmount(value: unknown): RazorpayYearlyAmount {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1500) return 1500;
  return DEFAULT_RAZORPAY_YEARLY_AMOUNT;
}

export function formatYearlyAmountInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function paidUntilDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when Razorpay shows an active/authenticated sub or paidUntil is still in the future. */
export function isSubscriptionPaid(business: BillingBusiness): boolean {
  const status = (business.razorpaySubscriptionStatus ?? "").toLowerCase();
  if (PAID_STATUSES.has(status)) return true;
  const until = paidUntilDate(business.paidUntil);
  return Boolean(until && until.getTime() > Date.now());
}

/**
 * Customer review QR is live when:
 * - admin has Enabled turned on, AND
 * - manual billing, OR Razorpay subscription is paid.
 */
export function isCustomerQrActive(business: BillingBusiness): boolean {
  if (!business.enabled) return false;
  const mode = normalizeBillingMode(business.billingMode);
  if (mode === "manual") return true;
  return isSubscriptionPaid(business);
}

const CANCELLED_STATUSES = new Set(["cancelled", "completed", "expired"]);

export function billingPublicStatus(business: BillingBusiness) {
  const mode = normalizeBillingMode(business.billingMode);
  const paid = isSubscriptionPaid(business);
  const active = isCustomerQrActive(business);
  const until = paidUntilDate(business.paidUntil);
  const status = (business.razorpaySubscriptionStatus ?? "").toLowerCase();
  const yearlyAmount = normalizeRazorpayYearlyAmount(business.razorpayYearlyAmount);
  const cancelScheduled = CANCELLED_STATUSES.has(status) && paid;
  const canCancel =
    mode === "razorpay" &&
    paid &&
    Boolean(business.razorpaySubscriptionId) &&
    !CANCELLED_STATUSES.has(status);
  return {
    billingMode: mode,
    subscriptionStatus: business.razorpaySubscriptionStatus,
    subscriptionId: business.razorpaySubscriptionId ?? null,
    yearlyAmount,
    yearlyAmountLabel: formatYearlyAmountInr(yearlyAmount),
    paidUntil: until ? until.toISOString() : null,
    nextRenewalAt: until && !cancelScheduled ? until.toISOString() : null,
    subscriptionPaid: paid,
    customerQrActive: active,
    canCancel,
    cancelScheduled,
  };
}
