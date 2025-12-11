"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // AuthProvider will redirect to login
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-hidden w-full max-w-full">
      <Sidebar />
      {/* Sidebar genişlikleri: sm:w-56, md:w-60, lg:w-64 */}
      <div className="sm:pl-56 md:pl-60 lg:pl-64 min-w-0 w-full max-w-full transition-all duration-300">
        <Header />
        <main className="p-3 sm:p-4 md:p-6 min-w-0 w-full max-w-full overflow-x-hidden box-border">{children}</main>
      </div>
    </div>
  );
}
