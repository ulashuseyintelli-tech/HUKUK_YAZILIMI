"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { portalEmailInputProblem, readPortalEmailField } from "@/lib/portal-credential-input";
import { useHydrated } from "@/lib/use-hydrated";


export default function PortalLoginPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  // PORTAL-RESET-FORM-01: e-posta ve parola alanları KONTROLSÜZDÜR; değerler gönderim anında alanların
  // kendisinden okunur. Ölçülen kusur (üretim derlemesi): alanlar `useState` ile kontrollüyken sayfa React
  // tarafından devralınmadan önce yazılan / yapıştırılan / otomatik doldurulan değerler ekranda görünüyor ama
  // duruma girmiyordu; 2026-10-02'de gönderimde `{ email: "", password: "" }` gidiyordu, #2894 sonrası
  // (2026-10-03) devralmadan hemen sonraki çizim iki alanı da siliyordu.
  // Alanlara `name` bilerek verilmez: yerel (React dışı) gönderim bugünkü gibi alanları taşımaz.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Tek kullanıcı gönderimi tek istek: yanıt beklenirken gelen ikinci gönderim olayı yok sayılır. Durum
  // (`loading`) bir sonraki çizime kadar eski kalabildiği için kilit ref'tedir. Başarıda sayfa ayrıldığı için
  // kilit açılmaz; hata yanıtında açılır (kullanıcı yeniden deneyebilir).
  const inFlightRef = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    const email = readPortalEmailField(emailRef.current);
    // Parola olduğu gibi okunur (kırpılmaz).
    const password = passwordRef.current?.value ?? "";
    const problem = portalEmailInputProblem(email) ?? (password ? null : "Şifrenizi girin.");
    if (problem) {
      setError(problem);
      return;
    }

    inFlightRef.current = true;
    setError("");
    setLoading(true);
    let succeeded = false;

    try {
      const res = await fetch(portalApiUrl("/api/portal/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Giriş başarısız");
      }

      localStorage.setItem("portal_token", data.token);
      localStorage.setItem("portal_user", JSON.stringify(data.user));
      succeeded = true;
      router.push("/portal");
    } catch (err: any) {
      setError(err.message || "Giriş yapılamadı");
    } finally {
      if (!succeeded) {
        inFlightRef.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Scale className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Müvekkil Portalı</h1>
          <p className="text-gray-500 mt-1">Dosyalarınızı takip edin</p>
        </div>

        {/* Yerel (React dışı) gönderim alanları ADRESE yazmasın: yöntem POST; düğme React devralana dek
            kapalı (bkz. lib/use-hydrated.ts). Alanlar bugün `name` taşımadığı için adrese yazılmıyor; bu,
            o tesadüfe bağlı kalmamak içindir. Normal akış değişmez: `onSubmit` preventDefault eder. */}
        <form onSubmit={handleLogin} method="post" className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={emailRef}
                type="email"
                placeholder="ornek@email.com"
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading || !hydrated}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Giriş yapılıyor...
              </>
            ) : (
              "Giriş Yap"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/portal/forgot-password" className="text-sm text-blue-600 hover:underline">
            Şifremi Unuttum
          </a>
        </div>

        <div className="mt-8 pt-6 border-t text-center text-xs text-gray-500">
          Hukuk büronuz tarafından sağlanan portal hesabınızla giriş yapın.
        </div>
      </div>
    </div>
  );
}
