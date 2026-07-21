"use client";

// OFFICE-AUTH-P02: office/staff credential-recovery — token ile yeni parola belirleme.
// Normal login akışının PARÇASI DEĞİLDİR. Token URL query'den okunur, hiçbir yerde
// loglanmaz/persist edilmez.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const passwordConfirmation = formData.get("passwordConfirmation") as string;

    if (password !== passwordConfirmation) {
      setError("Yeni parola ve tekrarı eşleşmiyor");
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword(token, password, passwordConfirmation);
      setDone(true);
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch (err: any) {
      // Backend'in hangi sebeple reddettiğini (expired/consumed/revoked/yok) ayırt etmeden
      // tek, genel bir hata mesajı gösterilir (enumeration-safe).
      setError("Bu bağlantı geçersiz veya süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin.");
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
            <h1 className="text-2xl font-bold">Yeni Parola Belirle</h1>
            <p className="text-muted-foreground mt-2">Hesabınız için yeni bir parola girin</p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {error}
              <div className="mt-2">
                <Link href="/auth/forgot-password" className="text-primary hover:underline">
                  Yeni bağlantı iste
                </Link>
              </div>
            </div>
          )}

          {!token && !error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              Geçersiz bağlantı — token bulunamadı.
            </div>
          )}

          {done ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Parolanız güncellendi. Giriş sayfasına yönlendiriliyorsunuz...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2">
                  Yeni Parola
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="passwordConfirmation" className="block text-sm font-medium mb-2">
                  Yeni Parola (Tekrar)
                </label>
                <PasswordInput
                  id="passwordConfirmation"
                  name="passwordConfirmation"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !token}
                className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? "Kaydediliyor..." : "Parolayı Güncelle"}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Giriş sayfasına dön
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
