"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale, Loader2, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function ResetPasswordShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Scale className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Şifre Sıfırla</h1>
          <p className="text-gray-500 mt-1">Yeni şifrenizi belirleyin</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Başarılı sıfırlama sonrası giriş sayfasına yönlendir (manuel link de aşağıda sunulur).
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.push("/portal/login"), 2000);
    return () => clearTimeout(timer);
  }, [success, router]);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold">Geçersiz Bağlantı</h2>
        <p className="text-gray-600 text-sm">
          Şifre sıfırlama bağlantısı eksik veya geçersiz. Lütfen yeni bir sıfırlama talebi oluşturun.
        </p>
        <Link
          href="/portal/forgot-password"
          className="inline-flex items-center gap-2 text-blue-600 hover:underline mt-4"
        >
          <ArrowLeft className="h-4 w-4" /> Şifre sıfırlama talebine dön
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold">Şifreniz Güncellendi</h2>
        <p className="text-gray-600 text-sm">Yeni şifrenizle giriş yapabilirsiniz.</p>
        <Link
          href="/portal/login"
          className="inline-flex items-center gap-2 text-blue-600 hover:underline mt-4"
        >
          <ArrowLeft className="h-4 w-4" /> Giriş sayfasına dön
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Şifre en az 8 karakter olmalıdır");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Şifreler eşleşmiyor");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/portal/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!res.ok) {
        throw new Error("Geçersiz veya süresi dolmuş bağlantı. Lütfen yeni bir talep oluşturun.");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Geçersiz veya süresi dolmuş bağlantı. Lütfen yeni bir talep oluşturun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Yeni Şifre
        </label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          className="w-full pl-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">En az 8 karakter</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Yeni Şifre (Tekrar)
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          className="w-full pl-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Güncelleniyor...
          </>
        ) : (
          "Şifreyi Güncelle"
        )}
      </button>

      <Link
        href="/portal/login"
        className="block text-center text-sm text-blue-600 hover:underline mt-4"
      >
        <ArrowLeft className="h-4 w-4 inline mr-1" /> Giriş sayfasına dön
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <ResetPasswordShell>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </ResetPasswordShell>
  );
}
