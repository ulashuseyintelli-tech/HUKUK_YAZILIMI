"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { QuickActions } from "@/components/quick-actions";
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
    <div className="h-screen bg-slate-50">
      <Sidebar />
      <KeyboardShortcuts />
      <QuickActions />
      {/* Mobilde sidebar yok, sm ve üstünde sidebar padding'i */}
      <div className="pl-0 sm:pl-56 md:pl-60 lg:pl-64 h-screen flex flex-col transition-all duration-300">
        <Header />
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto scrollbar-hide">{children}</main>
      </div>
    </div>
  );
}
