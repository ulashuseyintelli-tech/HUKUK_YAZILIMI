"use client";

import Link from "next/link";
import { Scale } from "lucide-react";

/**
 * OFFICE-AUTH-P01 register hotfix: bu sayfa önceden çalışan bir formmuş gibi görünüp
 * aslında hiçbir API'yi çağırmıyordu (console.log ile düz-metin parola loglayıp sahte
 * /dashboard yönlendirmesi yapıyordu — bkz. owner brief). Anonim/genel kayıt bu görevde
 * AKTİF EDİLMEDİ (ayrı owner kararı gerekir); sayfa artık fail-closed: hiçbir form
 * göstermez, yalnız bu bilgiyi açıkça belirtir. Backend /auth/register davranışı
 * değiştirilmedi (kapsam dışı).
 */
export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <Scale className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Hukuk Platform</span>
          </Link>
          <h1 className="text-2xl font-bold mb-2">Kayıt Şu An Kullanılamıyor</h1>
          <p className="text-muted-foreground">
            Yeni hesap oluşturma özelliği şu anda devre dışıdır. Mevcut bir hesabınız
            varsa giriş yapabilir, yoksa büronuzun yöneticisinden davet bekleyebilirsiniz.
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-block w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90"
          >
            Giriş sayfasına dön
          </Link>
        </div>
      </div>
    </div>
  );
}
