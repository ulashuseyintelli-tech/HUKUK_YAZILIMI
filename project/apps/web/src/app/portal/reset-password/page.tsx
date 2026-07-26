"use client";

// CLIENT-SEC-P01: ham reset token artık URL FRAGMENT'ından (#token=...) okunur — query
// string DEĞİL. Fragment tarayıcı dışına asla gönderilmez (sunucu/proxy access log'u,
// `Referer` header'ı ve `location.search` okuyan analytics yüzeyleri token'ı GÖRMEZ).
// Okunduktan hemen sonra `history.replaceState` ile adres çubuğundan/geçmişten temizlenir;
// token yalnız request BODY ile backend'e gider, local/sessionStorage'a ASLA yazılmaz.
// Eski `?token=` linkleri KABUL EDİLMEZ (fallback yok) — kullanıcı yeni link ister.
// OFFICE emsali: app/auth/reset-password/page.tsx (OFFICE-AUTH-P02-HARDENING-R01, PR #1494).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Scale, Loader2, Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const fragmentParams = new URLSearchParams(rawHash);
    setToken(fragmentParams.get("token") ?? "");
    setTokenChecked(true);
    if (window.location.hash) {
      // Ham token adres çubuğunda/tarayıcı geçmişinde kalmasın.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Bağlantı geçersiz (token bulunamadı). Lütfen şifre sıfırlama talebini tekrar başlatın.");
      return;
    }
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/portal/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Şifre sıfırlanamadı");
      }

      setDone(true);
      // CLIENT-SEC-P01: tüketilen ham token client belleğinde gereksiz tutulmaz.
      setToken("");
      setTimeout(() => router.push("/portal/login"), 1500);
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

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

        {done ? (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Şifreniz Güncellendi</h2>
            <p className="text-gray-600 text-sm">Giriş sayfasına yönlendiriliyorsunuz…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
                <div className="mt-2">
                  <Link href="/portal/forgot-password" className="text-blue-600 hover:underline">
                    Yeni bağlantı iste
                  </Link>
                </div>
              </div>
            )}

            {/* tokenChecked: fragment ancak mount sonrası okunabildiği için ilk render'da
                token her zaman boştur — uyarı yalnız okuma tamamlandıktan sonra gösterilir. */}
            {tokenChecked && !token && !error && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Bağlantı geçersiz görünüyor. Lütfen e-postanızdaki bağlantıyı kullanın.
                <div className="mt-2">
                  <Link href="/portal/forgot-password" className="text-blue-600 hover:underline">
                    Yeni bağlantı iste
                  </Link>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 8 karakter"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre (Tekrar)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Şifrenizi tekrar girin"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Kaydediliyor...
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
        )}
      </div>
    </div>
  );
}
