"use client";

// Error Logs UI polish: küçük kopyala butonu (requestId / stack / metadata JSON).
// navigator.clipboard yoksa SESSİZCE geçer (best-effort; UI'yi bozmaz).
import { useState } from "react";

interface Props {
  value: string;
  label?: string;
  ariaLabel?: string;
}

export function CopyButton({ value, label = "Kopyala", ariaLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // clipboard erişimi yoksa/izin yoksa sessizce geç
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel ?? label}
      className="text-xs px-1.5 py-0.5 border rounded text-gray-600 hover:bg-gray-50"
    >
      {copied ? "Kopyalandı" : label}
    </button>
  );
}
