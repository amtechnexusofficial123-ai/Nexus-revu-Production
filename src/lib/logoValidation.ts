const MAX_LOGO_CHARS = 400_000;

/**
 * Normalizes / validates a logo value from the client.
 * Accepts empty, https URL, or a compressed image data URL.
 */
export function normalizeLogoUrl(logoUrl: unknown): string | null | { error: string } {
  if (logoUrl === undefined) return null;
  if (logoUrl === null || logoUrl === "") return null;
  if (typeof logoUrl !== "string") return { error: "Invalid logo" };

  const value = logoUrl.trim();
  if (!value) return null;

  if (value.startsWith("data:image/")) {
    if (value.length > MAX_LOGO_CHARS) {
      return { error: "Logo is too large. Try a smaller image." };
    }
    return value;
  }

  if (value.startsWith("https://") || value.startsWith("http://")) {
    if (value.length > 2000) return { error: "Logo URL is too long" };
    return value;
  }

  return { error: "Logo must be an uploaded image or a valid URL" };
}
