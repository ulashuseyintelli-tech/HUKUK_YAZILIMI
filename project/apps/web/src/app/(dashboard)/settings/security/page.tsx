"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * OFFICE-AUTH-P01: authenticated OFFICE kullanıcısı (Lawyer/StaffMember/Admin) için
 * self-service parola değiştirme. ClientPortalUser bu sayfanın kapsamı DIŞINDADIR
 * (portal kullanıcıları kendi ayrı /portal/profile ekranını kullanır).
 */
export default function SecuritySettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 12) {
      setError("Yeni parola en az 12 karakter olmalıdır.");
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError("Yeni parola en fazla 72 bayt (UTF-8) olabilir.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yeni parola ve tekrarı eşleşmiyor.");
      return;
    }

    setSaving(true);
    try {
      await api.changeMyPassword(currentPassword, newPassword, confirmPassword);
      // Parola değişince tokenVersion sunucuda artar; bu oturumun token'ı da artık
      // geçersizdir — iki storage'ı da temizleyip login'e yönlendir.
      api.clearToken();
      router.push("/auth/login");
    } catch (err: any) {
      setError(err?.body?.message || err?.message || "Parola değiştirilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="flex items-center gap-2 mb-6">
        <KeyRound className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Parolamı Değiştir</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-lg border p-6">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium mb-2">
            Mevcut Parola
          </label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium mb-2">
            Yeni Parola (en az 12 karakter)
          </label>
          <PasswordInput
            id="newPassword"
            name="newPassword"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
            Yeni Parola (Tekrar)
          </label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Kaydediliyor…" : "Parolayı Değiştir"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          Parolanız değiştirildikten sonra tekrar giriş yapmanız gerekecek.
        </p>
      </form>
    </div>
  );
}
