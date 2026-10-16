"use client";

// K1-7: Davet kabul / parola belirleme sayfası.
// Bağlantıdaki tek-kullanımlık token + kullanıcının belirlediği parola → hesap aktifleşir.
//
// GÜV-01 P3 (DV-201): yeni davet bağlantıları token'ı adres PARÇASINDA taşır
// (`/auth/accept-invite#token=…`); parça tarayıcı dışına gönderilmez → sunucu / kenar katmanı
// erişim günlüklerine ve `Referer` başlığına düşmez. Geçiş süresince ESKİ `?token=` bağlantıları
// kendi geçerlilikleri boyunca desteklenir (süre uzatılmaz; sunucu süreyi ve tek kullanımı denetler).
// Token okunur okunmaz `history.replaceState` ile adresten (çubuk + geçerli geçmiş girdisi) silinir;
// yalnız bellekte (React durumu) tutulur, konsola / günlüğe / localStorage / sessionStorage / çereze
// YAZILMAZ ve yalnız kabul POST gövdesinde gider (`api.acceptInvite`).
// Eski yolun kaldırılması: geçişten önce üretilmiş son davetin gerçek geçerlilik süresi ölçülene
// kadar YAPILMAZ (varsayılan 72 saat kesin kesim sayılmaz).
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useHydrated } from "@/lib/use-hydrated";

function AcceptInviteInner() {
  const router = useRouter();
  // Yalnız geçiş yolu (eski `?token=` bağlantıları) için; yeni bağlantılar parçayı kullanır.
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const [token, setToken] = useState("");
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    // Önce parça (yeni bağlantı); yoksa geçiş için sorgu dizesi (eski bağlantı).
    const found = new URLSearchParams(rawHash).get("token") || searchParams.get("token") || "";
    // React StrictMode (geliştirme) bu etkiyi iki kez çalıştırır; ikinci çalışma aşağıda temizlenmiş
    // adresi okur. Boş okuma önceki geçerli token'ı EZMEZ (reset-password/page.tsx ile aynı desen).
    if (found) setToken(found);
    setTokenChecked(true);

    // Ham token adres çubuğunda / tarayıcı geçmişinde / sonraki isteklerin `Referer` başlığında kalmasın:
    // parça bütünüyle, sorgu dizesinden yalnız `token` çıkarılır (yol ve başka parametreler korunur).
    const query = new URLSearchParams(window.location.search);
    const hadQueryToken = query.has("token");
    if (window.location.hash || hadQueryToken) {
      query.delete("token");
      const rest = query.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, [searchParams]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirm = formData.get("confirm") as string;

    if (!token) {
      setError("Davet bağlantısı geçersiz (token bulunamadı).");
      return;
    }
    if (password.length < 8) {
      setError("Parola en az 8 karakter olmalıdır.");
      return;
    }
    if (password !== confirm) {
      setError("Parolalar eşleşmiyor.");
      return;
    }

    setIsLoading(true);
    try {
      await api.acceptInvite(token, password);
      setDone(true);
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "Davet kabul edilemedi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <Scale className="h-8 w-8" />
          <h1 className="text-xl font-semibold">Hesap davetiniz</h1>
        </div>

        {done ? (
          <p className="text-center text-green-600">
            Parolanız belirlendi. Giriş sayfasına yönlendiriliyorsunuz…
          </p>
        ) : (
          // Yerel (React dışı) gönderim parolayı ADRESE yazmasın: yöntem POST; düğme React devralana dek
          // kapalı (bkz. lib/use-hydrated.ts). Normal akış değişmez: `onSubmit` preventDefault eder.
          <form onSubmit={handleSubmit} method="post" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hesabınızı etkinleştirmek için bir parola belirleyin.
            </p>
            <PasswordInput
              name="password"
              placeholder="Yeni parola (en az 8 karakter)"
              autoComplete="new-password"
              required
              className="w-full border rounded px-3 py-2"
            />
            <PasswordInput
              name="confirm"
              placeholder="Parola (tekrar)"
              autoComplete="new-password"
              required
              className="w-full border rounded px-3 py-2"
            />
            {/* Token'sız açılış: gönder düğmesi kapalı kalır; mevcut "geçersiz" iletisi baştan gösterilir. */}
            {tokenChecked && !token && !error && (
              <p className="text-sm text-red-600">Davet bağlantısı geçersiz (token bulunamadı).</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !token || !hydrated}
              className="w-full rounded bg-primary text-primary-foreground py-2 disabled:opacity-50"
            >
              {isLoading ? "Kaydediliyor…" : "Parolayı belirle ve etkinleştir"}
            </button>
            <p className="text-center text-sm">
              <Link href="/auth/login" className="underline">
                Giriş sayfasına dön
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Yükleniyor…</div>}>
      <AcceptInviteInner />
    </Suspense>
  );
}
