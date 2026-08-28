"use client";

import { useEffect, useState } from "react";
import { generateQuestionsQrDataUrl } from "@/lib/qrDownload";

type Props = {
  qrDataUrl: string | null;
  businessName: string;
  logoUrl?: string | null;
};

export function QuestionsQrPreview({ qrDataUrl, businessName, logoUrl }: Props) {
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

    generateQuestionsQrDataUrl(qrDataUrl, { businessName, logoUrl })
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
      alt="Questions QR card"
      className="w-full max-w-[420px] rounded-card shadow-sm"
    />
  );
}
