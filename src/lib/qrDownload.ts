const GOOGLE_BLUE = "#4285F4";
const GOOGLE_RED = "#EA4335";
const GOOGLE_YELLOW = "#FBBC05";
const GOOGLE_GREEN = "#34A853";
const INK = "#14171C";
const MUTED = "#5C6370";
const CTA_BLUE = "#1A73E8";
const BG = "#FFFFFF";
const GOOGLE_REVIEWS_LOGO_PATH = "/google-reviews-logo.png";

export type QrFlyerOptions = {
  businessName: string;
  logoUrl?: string | null;
};

export type QuestionsQrOptions = {
  logoUrl?: string | null;
  businessName?: string;
};

/** Safe download name: e.g. SweetCrumbsBakery_CustomerQR.png */
export function buildQrDownloadFilename(
  businessName: string,
  variant: "CustomerQR" | "QuestionsQR"
): string {
  const safe =
    businessName
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "") || "Business";
  return `${safe}_${variant}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function fitLogoDimensions(
  imgWidth: number,
  imgHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (imgWidth <= 0 || imgHeight <= 0) return { width: maxWidth, height: maxHeight };
  const ratio = imgWidth / imgHeight;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawGoogleRoundedBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  thickness: number
) {
  const r = Math.min(radius, w / 2, h / 2);
  const tl = { x: x + r, y: y + r };
  const tr = { x: x + w - r, y: y + r };
  const br = { x: x + w - r, y: y + h - r };
  const bl = { x: x + r, y: y + h - r };

  const strokeArc = (cx: number, cy: number, start: number, end: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
  };

  strokeArc(tl.x, tl.y, Math.PI, Math.PI * 1.5, GOOGLE_BLUE);
  strokeArc(tr.x, tr.y, Math.PI * 1.5, Math.PI * 2, GOOGLE_RED);
  strokeArc(br.x, br.y, 0, Math.PI * 0.5, GOOGLE_YELLOW);
  strokeArc(bl.x, bl.y, Math.PI * 0.5, Math.PI, GOOGLE_GREEN);

  const strokeLine = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  strokeLine(tl.x, y, tr.x, y, GOOGLE_RED);
  strokeLine(x + w, tr.y, x + w, br.y, GOOGLE_YELLOW);
  strokeLine(br.x, y + h, bl.x, y + h, GOOGLE_GREEN);
  strokeLine(x, bl.y, x, tl.y, GOOGLE_BLUE);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function normalizeFlyerOptions(options?: QrFlyerOptions | string | null): QrFlyerOptions {
  if (typeof options === "string" || options === null || options === undefined) {
    return { businessName: "Our business", logoUrl: typeof options === "string" ? options : null };
  }
  return options;
}

/** Renders the full review QR flyer to a canvas (shared by preview and download). */
export async function renderQrFlyerCanvas(
  qrDataUrl: string,
  options?: QrFlyerOptions | string | null
): Promise<HTMLCanvasElement> {
  const opts = normalizeFlyerOptions(options);
  const businessName = opts.businessName?.trim() || "Our business";
  const qr = await loadImage(qrDataUrl);

  let logo: HTMLImageElement | null = null;
  const trimmedLogo = opts.logoUrl?.trim();
  if (trimmedLogo) {
    try {
      logo = await loadImage(trimmedLogo);
    } catch {
      logo = null;
    }
  }

  let googleReviewsLogo: HTMLImageElement | null = null;
  try {
    const logoPath =
      typeof window !== "undefined"
        ? new URL(GOOGLE_REVIEWS_LOGO_PATH, window.location.origin).href
        : GOOGLE_REVIEWS_LOGO_PATH;
    googleReviewsLogo = await loadImage(logoPath);
  } catch {
    googleReviewsLogo = null;
  }

  const CARD_W = 520;
  const OUTER_BORDER = 10;
  const PAD = 28;
  const INNER_W = CARD_W - OUTER_BORDER * 2 - PAD * 2;
  const QR_SIZE = Math.min(280, INNER_W - 16);
  const BORDER_R = 22;
  const QR_BORDER = 6;
  const QR_FRAME_R = 14;
  const CTA_TEXT_H = 24;
  const FOOTER_H = 54;

  const logoMaxW = INNER_W * 0.72;
  const logoMaxH = 88;
  const logoDims =
    logo !== null
      ? fitLogoDimensions(logo.naturalWidth, logo.naturalHeight, logoMaxW, logoMaxH)
      : { width: 0, height: 0 };

  const googleReviewsMaxW = INNER_W * 0.78;
  const googleReviewsMaxH = 96;
  const googleReviewsDims =
    googleReviewsLogo !== null
      ? fitLogoDimensions(
          googleReviewsLogo.naturalWidth,
          googleReviewsLogo.naturalHeight,
          googleReviewsMaxW,
          googleReviewsMaxH
        )
      : { width: 0, height: 0 };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create image");

  ctx.font = `600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const nameLines = wrapText(ctx, businessName, INNER_W - 8);
  const nameBlockH = nameLines.length * 32;

  let contentH = PAD;
  if (logo) contentH += logoDims.height + 16;
  contentH += nameBlockH + 8 + 20;
  if (googleReviewsLogo) contentH += googleReviewsDims.height + 24;
  contentH += QR_SIZE + QR_BORDER * 2 + 20 + CTA_TEXT_H + 16 + FOOTER_H + PAD;

  canvas.width = CARD_W;
  canvas.height = contentH + OUTER_BORDER * 2;

  const innerX = OUTER_BORDER;
  const innerY = OUTER_BORDER;
  const innerW = CARD_W - OUTER_BORDER * 2;
  const innerH = canvas.height - OUTER_BORDER * 2;

  ctx.fillStyle = BG;
  roundRectPath(ctx, innerX, innerY, innerW, innerH, BORDER_R);
  ctx.fill();

  drawGoogleRoundedBorder(ctx, innerX, innerY, innerW, innerH, BORDER_R, OUTER_BORDER);

  let y = innerY + PAD;
  const centerX = CARD_W / 2;

  if (logo) {
    const logoX = centerX - logoDims.width / 2;
    ctx.drawImage(logo, logoX, y, logoDims.width, logoDims.height);
    y += logoDims.height + 16;
  }

  ctx.fillStyle = INK;
  ctx.font = `600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const line of nameLines) {
    ctx.fillText(line, centerX, y);
    y += 32;
  }

  y += 4;
  ctx.fillStyle = MUTED;
  ctx.font = `400 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.fillText("Thank you for choosing us!", centerX, y);
  y += 28;

  if (googleReviewsLogo) {
    const gx = centerX - googleReviewsDims.width / 2;
    ctx.drawImage(
      googleReviewsLogo,
      gx,
      y,
      googleReviewsDims.width,
      googleReviewsDims.height
    );
    y += googleReviewsDims.height + 24;
  }

  const qrFrameW = QR_SIZE + QR_BORDER * 2;
  const qrFrameX = centerX - qrFrameW / 2;
  const qrFrameY = y;
  const qrFrameH = qrFrameW;

  ctx.fillStyle = BG;
  roundRectPath(ctx, qrFrameX, qrFrameY, qrFrameW, qrFrameH, QR_FRAME_R);
  ctx.fill();
  drawGoogleRoundedBorder(ctx, qrFrameX, qrFrameY, qrFrameW, qrFrameH, QR_FRAME_R, QR_BORDER);

  ctx.drawImage(qr, qrFrameX + QR_BORDER, qrFrameY + QR_BORDER, QR_SIZE, QR_SIZE);
  y += qrFrameH + 20;

  ctx.fillStyle = MUTED;
  ctx.font = `400 14px Georgia, "Iowan Old Style", "Palatino Linotype", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Scan to leave a review", centerX, y);
  y += CTA_TEXT_H + 16;

  const footerTop = y;
  const lineX1 = innerX + PAD;
  const lineX2 = innerX + innerW - PAD;
  ctx.strokeStyle = "rgba(20, 23, 28, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lineX1, footerTop);
  ctx.lineTo(lineX2, footerTop);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = `400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Your feedback helps us serve you better.", centerX, footerTop + 14);
  ctx.fillText("We appreciate your support!", centerX, footerTop + 32);

  return canvas;
}

/** Data URL for in-app flyer preview (matches downloaded PNG). */
export async function generateQrFlyerDataUrl(
  qrDataUrl: string,
  options?: QrFlyerOptions | string | null
): Promise<string> {
  const canvas = await renderQrFlyerCanvas(qrDataUrl, options);
  return canvas.toDataURL("image/png");
}

/** Downloads a print-ready review QR flyer PNG. */
export async function downloadQrImage(
  qrDataUrl: string,
  filename: string,
  options?: QrFlyerOptions | string | null
) {
  const canvas = await renderQrFlyerCanvas(qrDataUrl, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create image");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

function drawLogoPlaceholder(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  size: number,
  businessName: string
) {
  ctx.fillStyle = "#F3E8F5";
  ctx.beginPath();
  ctx.arc(centerX, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CTA_BLUE;
  ctx.font = `600 ${size * 0.42}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((businessName || "?").charAt(0).toUpperCase(), centerX, y + size / 2);
}

/** Renders the staff questions QR card: logo, scan line, framed QR. */
export async function renderQuestionsQrCanvas(
  qrDataUrl: string,
  options?: QuestionsQrOptions
): Promise<HTMLCanvasElement> {
  const businessName = options?.businessName?.trim() || "Business";
  const qr = await loadImage(qrDataUrl);

  let logo: HTMLImageElement | null = null;
  const trimmedLogo = options?.logoUrl?.trim();
  if (trimmedLogo) {
    try {
      logo = await loadImage(trimmedLogo);
    } catch {
      logo = null;
    }
  }

  const CARD_W = 420;
  const OUTER_BORDER = 10;
  const PAD = 28;
  const INNER_W = CARD_W - OUTER_BORDER * 2 - PAD * 2;
  const QR_SIZE = Math.min(260, INNER_W - 16);
  const BORDER_R = 22;
  const QR_BORDER = 6;
  const QR_FRAME_R = 14;
  const PLACEHOLDER_SIZE = 64;

  const logoMaxW = INNER_W * 0.72;
  const logoMaxH = 88;
  const logoDims =
    logo !== null
      ? fitLogoDimensions(logo.naturalWidth, logo.naturalHeight, logoMaxW, logoMaxH)
      : { width: 0, height: 0 };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create image");

  let contentH = PAD;
  if (logo) contentH += logoDims.height + 20;
  else contentH += PLACEHOLDER_SIZE + 20;
  contentH += 20 + 28 + QR_SIZE + QR_BORDER * 2 + PAD;

  canvas.width = CARD_W;
  canvas.height = contentH + OUTER_BORDER * 2;

  const innerX = OUTER_BORDER;
  const innerY = OUTER_BORDER;
  const innerW = CARD_W - OUTER_BORDER * 2;
  const innerH = canvas.height - OUTER_BORDER * 2;
  const centerX = CARD_W / 2;

  ctx.fillStyle = BG;
  roundRectPath(ctx, innerX, innerY, innerW, innerH, BORDER_R);
  ctx.fill();
  drawGoogleRoundedBorder(ctx, innerX, innerY, innerW, innerH, BORDER_R, OUTER_BORDER);

  let y = innerY + PAD;

  if (logo) {
    ctx.drawImage(logo, centerX - logoDims.width / 2, y, logoDims.width, logoDims.height);
    y += logoDims.height + 20;
  } else {
    drawLogoPlaceholder(ctx, centerX, y, PLACEHOLDER_SIZE, businessName);
    y += PLACEHOLDER_SIZE + 20;
  }

  ctx.fillStyle = INK;
  ctx.font = `600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Scan this to upload questions", centerX, y);
  y += 28;

  const qrFrameW = QR_SIZE + QR_BORDER * 2;
  const qrFrameX = centerX - qrFrameW / 2;
  const qrFrameY = y;

  ctx.fillStyle = BG;
  roundRectPath(ctx, qrFrameX, qrFrameY, qrFrameW, qrFrameW, QR_FRAME_R);
  ctx.fill();
  drawGoogleRoundedBorder(ctx, qrFrameX, qrFrameY, qrFrameW, qrFrameW, QR_FRAME_R, QR_BORDER);
  ctx.drawImage(qr, qrFrameX + QR_BORDER, qrFrameY + QR_BORDER, QR_SIZE, QR_SIZE);

  return canvas;
}

export async function generateQuestionsQrDataUrl(
  qrDataUrl: string,
  options?: QuestionsQrOptions
): Promise<string> {
  const canvas = await renderQuestionsQrCanvas(qrDataUrl, options);
  return canvas.toDataURL("image/png");
}

export async function downloadQuestionsQrImage(
  qrDataUrl: string,
  filename: string,
  options?: QuestionsQrOptions
) {
  const canvas = await renderQuestionsQrCanvas(qrDataUrl, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create image");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
