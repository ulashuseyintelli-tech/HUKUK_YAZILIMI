"use client";

import {
  describeLawyerDefaultPermissionsStatus,
  grantedDefaultPermissionLabels,
  type LawyerDefaultPermissionsStatus,
} from "@/lib/lawyer-default-permissions-status";

/**
 * K3-L KP-9 — avukatın varsayılan dosya yetkisinin durumu (salt gösterim; onay aksiyonu YOK).
 * Durum sunucudan okunur (`GET /lawyers/default-permissions/status`); burada karar üretilmez.
 */

/// <remarks>
/// Çağrıldığı yerler:
/// - settings/office/page.tsx → Avukatlar listesi satırı
/// </remarks>
export function LawyerDefaultPermissionsBadge({ status }: { status: LawyerDefaultPermissionsStatus | null | undefined }) {
  if (!status) return null;
  const text = describeLawyerDefaultPermissionsStatus(status);
  return (
    <span
      data-testid="lawyer-default-permissions-badge"
      data-tone={text.tone}
      title={text.detail}
      className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium ${
        text.tone === "applied" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      {text.badge}
    </span>
  );
}

/// <remarks>
/// Çağrıldığı yerler:
/// - settings/office/page.tsx → LawyerModal "Varsayılan Yetkiler" bölümü (yalnız kayıtlı avukat düzenlenirken)
/// </remarks>
export function LawyerDefaultPermissionsStatusBlock({ status }: { status: LawyerDefaultPermissionsStatus | null | undefined }) {
  if (!status) {
    return (
      <p
        data-testid="lawyer-default-permissions-status-unknown"
        className="mb-2 rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
      >
        Durum okunamadı: kayıtlı varsayılan yetkinin yeni dosyalara uygulanıp uygulanmadığı gösterilemiyor. Aşağıdaki işaretler
        kayıtlı değer olmayabilir.
      </p>
    );
  }
  const text = describeLawyerDefaultPermissionsStatus(status);
  const granted = grantedDefaultPermissionLabels(status.storedPermissions);
  return (
    <div
      data-testid="lawyer-default-permissions-status"
      data-tone={text.tone}
      className={`mb-2 rounded border p-2 text-[11px] ${
        text.tone === "applied" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">{text.badge}</p>
      <p>{text.detail}</p>
      <p data-testid="lawyer-default-permissions-stored" className="mt-1">
        <span className="font-medium">Kayıtlı değer: </span>
        {status.storedPermissions === null ? "yok" : granted.length > 0 ? granted.join(", ") : "açık yetki yok"}
      </p>
    </div>
  );
}
