"use client";

// PR-4: React render crash yakalar. Minimal fallback (UI genişletmesi PR-5'e ait).
// componentStack METADATA'ya DEĞİL → stack alanına eklenir (backend whitelist'inde componentStack yok).
import React from "react";
import { reportClientError } from "@/lib/error-reporter";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const stack =
      (error?.stack ?? "") +
      (errorInfo?.componentStack ? `\n\nReact component stack:\n${errorInfo.componentStack}` : "");
    const path =
      typeof window !== "undefined" ? window.location?.pathname ?? "" : "";
    reportClientError({
      level: "ERROR",
      message: error?.message || "React render error",
      stack, // reporter STACK_MAX (8000) ile cap'ler
      endpoint: `web:render ${path}`,
      metadata: { safeErrorCode: "REACT_RENDER_CRASH" },
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <p>Bir hata oluştu. Sayfayı yenileyin.</p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
