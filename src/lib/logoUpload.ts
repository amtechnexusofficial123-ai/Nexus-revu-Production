/**
 * Reads an image file, downscales it, and returns a JPEG data URL suitable
 * for storing in `businesses.logo_url` without an object store.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, or WebP).");
  }
  // ~5MB original — we shrink it before saving
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image is too large. Please use a file under 5MB.");
  }

  const bitmap = await createImageBitmap(file);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process this image.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  // Keep DB rows reasonable (~400KB of base64)
  if (dataUrl.length > 400_000) {
    throw new Error("Image is still too large after compression. Try a simpler photo.");
  }
  return dataUrl;
}
