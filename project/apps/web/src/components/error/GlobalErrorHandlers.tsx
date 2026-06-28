"use client";

// PR-4: Global browser hata yakalama. window 'error' + 'unhandledrejection' → reportClientError.
// HTTP-status taşıyan reason (api client'ın fırlattığı {status,body}) → SKIP (backend zaten loglar).
// Ham object serialize EDİLMEZ; yalnız güvenli generic message + safeErrorCode gider.
import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporter";

export function GlobalErrorHandlers(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = () => window.location?.pathname ?? "";

    const onError = (event: ErrorEvent) => {
      const err = event.error;
      reportClientError({
        level: "ERROR",
        message: event.message || err?.message || "window.onerror",
        stack: err?.stack,
        endpoint: `web:window ${path()}`,
        metadata: { safeErrorCode: "WINDOW_ERROR" },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      let message: string;
      let stack: string | undefined;

      if (reason instanceof Error) {
        message = reason.message || "Unhandled rejection";
        stack = reason.stack;
      } else if (typeof reason === "string") {
        message = reason;
      } else {
        // HTTP hata objesi (api client {status,body}) → backend zaten loglar, SKIP (duplicate önle).
        if (reason && typeof reason === "object" && typeof reason.status === "number") return;
        message = "Unhandled promise rejection"; // ham object GÖNDERİLMEZ
      }

      reportClientError({
        level: "ERROR",
        message,
        stack,
        endpoint: `web:rejection ${path()}`,
        metadata: { safeErrorCode: "UNHANDLED_REJECTION" },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
