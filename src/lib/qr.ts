import QRCode from "qrcode";

/** Generates a QR code as a data URL pointing at the customer review page. */
export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 512,
    margin: 2,
    color: { dark: "#14171C", light: "#FAF9F6" },
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
