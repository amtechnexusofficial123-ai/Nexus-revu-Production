import QRCode from "qrcode";

/** Fast on-screen preview size (client-side). */
export const QR_PREVIEW_SIZE = 384;
/** Print / download size (generated only when downloading). */
export const QR_PRINT_SIZE = 2048;

const QR_COLORS = { dark: "#14171C", light: "#FAF9F6" } as const;

/** Generates a QR code as a PNG data URL. */
export async function generateQrDataUrl(
  url: string,
  options?: { width?: number }
): Promise<string> {
  return QRCode.toDataURL(url, {
    width: options?.width ?? QR_PREVIEW_SIZE,
    margin: 2,
    errorCorrectionLevel: "M",
    color: QR_COLORS,
  });
}

/**
 * Google's own "write a review" deep link. This opens Google's native
 * review composer for the given Place ID — the customer still has to be
 * logged into their own Google account and press submit themselves.
 * There is no supported way to pre-fill the review text via URL, so the
 * app copies the draft to the clipboard and the customer pastes it in.
 */
export function googleWriteReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(
    placeId
  )}`;
}
