"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { GlobalErrorHandlers } from "@/components/error/GlobalErrorHandlers";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    // PR-4: ErrorBoundary en dışta (render crash yakalar) + GlobalErrorHandlers (window error/rejection).
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <GlobalErrorHandlers />
          {children}
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
