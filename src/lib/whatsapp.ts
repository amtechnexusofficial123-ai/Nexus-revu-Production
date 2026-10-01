/**
 * Normalizes a WhatsApp number to digits only (with country code).
 * Returns null if empty or invalid.
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function validateWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  if (!normalizeWhatsAppNumber(input)) {
    return "WhatsApp number looks invalid. Use digits with country code, e.g. +91 9876543210.";
  }
  return null;
}

export function whatsappChatUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${phoneDigits}?text=${text}`;
}

export function buildNegativeReviewWhatsAppMessage(
  businessName: string,
  answers: { question: string; answer: string }[]
): string {
  const lines = answers
    .filter((a) => a.answer.trim())
    .map((a) => `${a.question}: ${a.answer}`);

  const detail =
    lines.length > 0
      ? `\n\nWhat happened:\n${lines.join("\n")}`
      : "";

  return `Hi, I had a concern about my experience at ${businessName}. I'd like to speak with management to sort this out.${detail}`;
}
