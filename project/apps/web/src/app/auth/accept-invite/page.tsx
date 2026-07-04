"use client";

// K1-7: Davet kabul / parola belirleme sayfası.
// URL'deki tek-kullanımlık token + kullanıcının belirlediği parola → hesap aktifleşir.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";

function AcceptInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hesabınızı etkinleştirmek için bir parola belirleyin.
            </p>
            <input
              name="password"
              type="password"
              placeholder="Yeni parola (en az 8 karakter)"
              autoComplete="new-password"
              required
              className="w-full border rounded px-3 py-2"
            />
            <input
              name="confirm"
              type="password"
              placeholder="Parola (tekrar)"
              autoComplete="new-password"
              required
              className="w-full border rounded px-3 py-2"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !token}
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
