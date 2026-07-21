"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/ui/PasswordInput";

const REMEMBERED_LOGIN_KEY = "rememberedLogin";

function readRememberedLogin(): { tenantSlug: string; email: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_LOGIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  // AUTH-01: account-recovery akışından dönüşte tenantSlug prefill edilir.
  const searchParams = useSearchParams();
  const prefillTenantSlug = searchParams.get("tenantSlug") ?? "";
  const [tenantSlug, setTenantSlug] = useState(prefillTenantSlug);
  const [email, setEmail] = useState("");
  // OFFICE-AUTH-P02-HARDENING-R01: varsayılan false (fail-closed) — capability fetch
  // başarısız olursa veya flag kapalıysa link hiç gösterilmez.
  const [passwordRecoveryEnabled, setPasswordRecoveryEnabled] = useState(false);

  // Beni hatırla ile önceki ziyarette kaydedilmiş kurum/e-posta varsa doldur.
  // URL'den gelen açık tenantSlug (account-recovery dönüşü) önceliklidir.
  useEffect(() => {
    if (prefillTenantSlug) return;
    const remembered = readRememberedLogin();
    if (remembered) {
      setTenantSlug(remembered.tenantSlug);
      setEmail(remembered.email);
      setRememberMe(true);
    }
  }, [prefillTenantSlug]);

  useEffect(() => {
    let cancelled = false;
    api
      .getAuthCapabilities()
      .then((capabilities) => {
        if (!cancelled) setPasswordRecoveryEnabled(capabilities.passwordRecoveryEnabled);
      })
      .catch(() => {
        // Fail-closed: fetch hatasında link gösterilmez (varsayılan false zaten korunur).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;

    try {
      await login(email, password, tenantSlug, rememberMe);
      if (typeof window !== "undefined") {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ tenantSlug, email }));
        } else {
          localStorage.removeItem(REMEMBERED_LOGIN_KEY);
        }
      }
    } catch (err: any) {
      // API bağlantı hatası için özel mesaj
      if (err.message?.includes('API sunucusuna bağlanılamıyor') || err.message?.includes('Failed to fetch')) {
        setError("API sunucusuna bağlanılamıyor. Lütfen API'nin çalıştığından emin olun. Terminalde 'pnpm run dev' komutunu çalıştırın.");
      } else if (err.message?.includes('API sunucusu yanıt vermiyor')) {
        setError("API sunucusu yanıt vermiyor. Lütfen API'yi yeniden başlatın.");
      } else {
        setError(err.message || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.");
      }
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
            <h1 className="text-2xl font-bold">Giriş Yap</h1>
            <p className="text-muted-foreground mt-2">
              Hesabınıza giriş yapın
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

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
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="ornek@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Şifre
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Beni hatırla</span>
              </label>
              {passwordRecoveryEnabled && (
                <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                  Şifremi unuttum
                </Link>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
          </form>

          {/* AUTH-01: kurum keşfi normal login akışının parçası değil, ayrı recovery sayfasına yönlendirir. */}
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/auth/account-recovery" className="text-primary hover:underline">
              Kurumunuzu bilmiyor musunuz?
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
