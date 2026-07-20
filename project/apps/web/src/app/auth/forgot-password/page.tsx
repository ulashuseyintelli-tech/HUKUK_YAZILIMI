"use client";

// OFFICE-AUTH-P02: office/staff credential-recovery — şifremi unuttum isteği.
// Normal login akışının PARÇASI DEĞİLDİR. tenantSlug zorunlu (login formuyla aynı desen).

import { useState } from "react";
import Link from "next/link";
import { Scale, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const tenantSlug = formData.get("tenantSlug") as string;

    try {
      await api.forgotPassword(email, tenantSlug);
      // Backend her zaman generic yanıt döner (enumeration-safe); burada da davranış farkı
      // yaratılmaz — yalnız ağ/istek hatası ayrı ele alınır.
      setSent(true);
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
            <h1 className="text-2xl font-bold">Şifremi Unuttum</h1>
            <p className="text-muted-foreground mt-2">
              Şifre sıfırlama bağlantısı için kurum ve e-posta bilginizi girin
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Eğer bu bilgilerle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı e-posta
                adresinize gönderildi.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="tenantSlug" className="block text-sm font-medium mb-2">
                  Kurum
                </label>
                <input
                  id="tenantSlug"
                  name="tenantSlug"
                  type="text"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="kurum-adi"
                />
              </div>

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
                {isLoading ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/auth/login" className="text-primary hover:underline">
                  Giriş sayfasına dön
                </Link>
              </p>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/auth/account-recovery" className="text-primary hover:underline">
                  Kurumunuzu bilmiyor musunuz?
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
