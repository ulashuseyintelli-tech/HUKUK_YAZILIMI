"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Scale, Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
// CLIENT-REMEDIATION-CLOSEOUT-R01: module-level `NEXT_PUBLIC_API_URL || "http://localhost:8080"
// fallback'i kaldırıldı — production'da env eksikse sessizce kullanıcının localhost'una
// düşüyordu. Base URL artık canonical config katmanından gelir (dev fallback yalnız orada,
// production'da fail-fast). CLIENT-CONFIG-P01 ile aynı sözleşme.
import { portalApiUrl } from "@/lib/config/portal-api-url";
import { portalEmailInputProblem, readPortalEmailField } from "@/lib/portal-credential-input";
import { useHydrated } from "@/lib/use-hydrated";


export default function ForgotPasswordPage() {
  const hydrated = useHydrated();
  // PORTAL-RESET-FORM-01: e-posta alanı KONTROLSÜZDÜR; değer gönderim anında alanın kendisinden okunur.
  // Ölçülen kusur (üretim derlemesi): alan `useState` ile kontrollüyken sayfa React tarafından devralınmadan
  // önce yazılan / yapıştırılan / otomatik doldurulan adres ekranda görünüyor ama duruma girmiyordu;
  // 2026-10-02'de gönderimde `{ email: "" }` gidiyor, API 201 dönüyor, kullanıcı "E-posta Gönderildi"
  // görüyor, e-posta gelmiyordu. #2894 sonrası (2026-10-03) devralmadan hemen sonraki çizim adresi siliyor;
  // tarayıcının alan denetimi yoksa boş gövde yine gidiyordu. Düğmeyi devralmaya kadar kapatmak alanı durumla
  // eşitlemez. Alana `name` bilerek verilmez: yerel (React dışı) gönderim bugünkü gibi alanı taşımaz.
  const emailRef = useRef<HTMLInputElement>(null);
  // Tek kullanıcı gönderimi tek istek: yanıt beklenirken gelen ikinci gönderim olayı yok sayılır. Durum
  // (`loading`) bir sonraki çizime kadar eski kalabildiği için kilit ref'tedir; hata yanıtında açılır.
  const inFlightRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    const email = readPortalEmailField(emailRef.current);
    // Boş / biçimsiz adres istek üretmez. Uyarı yalnız girdinin biçimine bağlıdır; sunucunun hesap var / yok
    // ayrımı yapmayan yanıtı ve "gönderildi" metni değişmez.
    const problem = portalEmailInputProblem(email);
    if (problem) {
      setError(problem);
      return;
    }

    inFlightRef.current = true;
    setError("");
    setLoading(true);
    let succeeded = false;

    try {
      const res = await fetch(portalApiUrl("/api/portal/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "İşlem başarısız");
      }

      succeeded = true;
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu");
    } finally {
      if (!succeeded) inFlightRef.current = false;
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
          <h1 className="text-2xl font-bold text-gray-900">Şifremi Unuttum</h1>
          <p className="text-gray-500 mt-1">Şifre sıfırlama bağlantısı gönderin</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">E-posta Gönderildi</h2>
            <p className="text-gray-600 text-sm">
              Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.
            </p>
            <Link
              href="/portal/login"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline mt-4"
            >
              <ArrowLeft className="h-4 w-4" /> Giriş sayfasına dön
            </Link>
          </div>
        ) : (
          // Yerel (React dışı) gönderim alanı ADRESE yazmasın: yöntem POST; düğme React devralana dek kapalı
          // (bkz. lib/use-hydrated.ts). Alan bugün `name` taşımadığı için adrese yazılmıyor; bu, o
          // tesadüfe bağlı kalmamak içindir.
          <form onSubmit={handleSubmit} method="post" className="space-y-4">
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

            <button
              type="submit"
              disabled={loading || !hydrated}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Gönderiliyor...
                </>
              ) : (
                "Şifre Sıfırlama Bağlantısı Gönder"
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
