"use client";

import { useEffect, useState } from "react";
import { generateQrFlyerDataUrl } from "@/lib/qrDownload";

type Props = {
  qrDataUrl: string | null;
  businessName: string;
  logoUrl?: string | null;
};

export function QrFlyerPreview({ qrDataUrl, businessName, logoUrl }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!qrDataUrl) {
      setPreviewUrl(null);
      setError(false);
      return;
    }

    let cancelled = false;
    setError(false);

    generateQrFlyerDataUrl(qrDataUrl, { businessName, logoUrl })
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(null);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrDataUrl, businessName, logoUrl]);

  if (!qrDataUrl) {
    return <p className="text-ink/50">Generating…</p>;
  }

  if (error) {
    return <p className="text-ink/50">Could not build preview</p>;
  }

  if (!previewUrl) {
    return <p className="text-ink/50">Building preview…</p>;
  }

  return (
    <img
      src={previewUrl}
      alt="Customer review QR flyer"
      className="w-full max-w-[520px] rounded-card shadow-sm"
    />
  );
}
