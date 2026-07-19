"use client";

// AUTH-01 — Account/Tenant Recovery akışı. Normal login akışının PARÇASI DEĞİLDİR;
// yalnız kullanıcı kendi isteğiyle "kurumumu bilmiyorum" dediğinde buraya gelir.

import { useState } from "react";
import Link from "next/link";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";

type Result =
  | { status: "NONE" }
  | { status: "SINGLE"; tenantSlug: string; tenantName: string }
  | { status: "MULTIPLE"; tenants: { tenantSlug: string; tenantName: string }[] }
  | null;

export default function AccountRecoveryPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const res = await api.findTenantsForEmail(email);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <Scale className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Hukuk Platform</span>
            </Link>
            <h1 className="text-2xl font-bold">Kurumumu Bulun</h1>
            <p className="text-muted-foreground mt-2">
              E-posta adresinizi girin, hangi kurum(lar) altında kayıtlı olduğunuzu gösterelim.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {!result && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  E-posta
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="ornek@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? "Aranıyor..." : "Kurumumu Bul"}
              </button>
            </form>
          )}

          {result && result.status === "NONE" && (
            <div className="text-sm text-muted-foreground text-center">
              Bu bilgilerle bir hesap bulunamadı. Kurumunuzun yöneticisiyle iletişime geçin.
            </div>
          )}

          {result && result.status === "SINGLE" && (
            <div className="text-sm text-center space-y-3">
              <p>
                Kurumunuz: <strong>{result.tenantName}</strong>
              </p>
              <Link
                href={`/auth/login?tenantSlug=${encodeURIComponent(result.tenantSlug)}`}
                className="inline-block w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90"
              >
                Giriş sayfasına dön
              </Link>
            </div>
          )}

          {result && result.status === "MULTIPLE" && (
            <div className="text-sm space-y-3">
              <p className="text-center text-muted-foreground">
                Bu e-posta birden fazla kurumda kayıtlı görünüyor:
              </p>
              <ul className="space-y-2">
                {result.tenants.map((t) => (
                  <li key={t.tenantSlug}>
                    <Link
                      href={`/auth/login?tenantSlug=${encodeURIComponent(t.tenantSlug)}`}
                      className="block w-full text-center border rounded-lg py-2 hover:bg-slate-50"
                    >
                      {t.tenantName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            <Link href="/auth/login" className="text-primary hover:underline">
              Giriş sayfasına dön
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
