const RAZORPAY_API = "https://api.razorpay.com/v1";

function getKeyId() {
  return process.env.RAZORPAY_KEY_ID?.trim() || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || "";
}

function getKeySecret() {
  return process.env.RAZORPAY_KEY_SECRET?.trim() || "";
}

export function isRazorpayConfigured() {
  return Boolean(getKeyId() && getKeySecret());
}

export function getRazorpayKeyId() {
  return getKeyId();
}

export function getRazorpayPlanId() {
  return process.env.RAZORPAY_PLAN_ID?.trim() || "";
}

/** Live/test plan id for a yearly INR amount (1500 or 2500). */
export function getRazorpayPlanIdForAmount(amountInr: number) {
  if (amountInr === 1500) {
    return (
      process.env.RAZORPAY_PLAN_ID_1500?.trim() ||
      process.env.RAZORPAY_PLAN_ID?.trim() ||
      ""
    );
  }
  return process.env.RAZORPAY_PLAN_ID?.trim() || "";
}

/** How many yearly cycles to create on the subscription (Razorpay requires total_count). */
export function getRazorpayTotalCount() {
  const n = Number(process.env.RAZORPAY_TOTAL_COUNT ?? "20");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function authHeader() {
  const id = getKeyId();
  const secret = getKeySecret();
  if (!id || !secret) throw new Error("Razorpay is not configured");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export async function razorpayRequest<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Razorpay returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    const err = data as { error?: { description?: string; code?: string } };
    throw new Error(
      err.error?.description || `Razorpay error ${res.status}${err.error?.code ? ` (${err.error.code})` : ""}`
    );
  }
  return data as T;
}

export type RazorpaySubscription = {
  id: string;
  status: string;
  plan_id: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  short_url?: string | null;
};

export async function createRazorpaySubscription(
  notes: Record<string, string>,
  options?: { yearlyAmountInr?: number }
) {
  const amount = options?.yearlyAmountInr ?? 2500;
  const planId = getRazorpayPlanIdForAmount(amount);
  if (!planId) {
    throw new Error(
      amount === 1500
        ? "RAZORPAY_PLAN_ID_1500 is not set"
        : "RAZORPAY_PLAN_ID is not set"
    );
  }

  return razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      total_count: getRazorpayTotalCount(),
      quantity: 1,
      customer_notify: 1,
      notes: {
        ...notes,
        yearlyAmountInr: String(amount),
      },
    },
  });
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Cancel a subscription. Default: end of current cycle (keeps access until paid period ends). */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  options?: { cancelAtCycleEnd?: boolean }
) {
  const cancelAtCycleEnd = options?.cancelAtCycleEnd !== false;
  return razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 },
    }
  );
}

export function unixToDate(seconds: number | null | undefined): Date | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/** Verify Razorpay payment signature from checkout (Node crypto). */
export async function verifySubscriptionPaymentSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): Promise<boolean> {
  const secret = getKeySecret();
  if (!secret) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const body = `${input.paymentId}|${input.subscriptionId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(input.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Allow in test if webhook secret not set yet — still prefer setting it.
    return true;
  }
  if (!signature) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
