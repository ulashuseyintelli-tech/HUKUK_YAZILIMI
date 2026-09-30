import type { ResponsibleSelection } from "@/components/case/responsible-candidate-select";

/**
 * Yeni takip sihirbazı — taslağın yeniden açılış kuralları (owner GO 2026-09-30, sihirbaz düzeltmeleri).
 *
 * 1. `?new=true` (menü "Yeni Takip") yeni başlangıç talebidir ve BİR KEZ işlenir: taslak temizlenir, parametre adresten
 *    kaldırılır. Önceden parametre adreste kaldığı için sonraki F5 kullanıcının girdiği taslağı da siliyordu. Menüden
 *    yeniden "Yeni Takip" seçmek yine açık yeni başlangıçtır.
 * 2. Dosya no: otomatik öneri (`GET /cases/next-file-number`) yalnız ÖNERİDİR, numara ayırmaz; kesin benzersizlik dosya
 *    açılışında (tenant + fileNumber, 409) korunur. Yeniden açılışta kullanıcının ELLE girdiği numara EZİLMEZ; taslaktaki
 *    değer son otomatik öneriyle aynıysa (kullanıcı değiştirmemiş) güncel öneriyle tazelenir. Hangisi olduğu bilinmeyen
 *    eski taslakta dolu değer KORUNUR (sessiz veri kaybı yerine gönderimde benzersizlik kontrolü).
 * 3. Dosya sorumlusu seçimi taslakta saklanır; geri yüklenen kimlik güncel aday listesinde (`GET
 *    /cases/responsible-candidates`: aynı büro, aktif, sorumlu olabilir) yoksa seçim DÜŞER ve kullanıcı yeniden seçer;
 *    sunucu da gönderimde geçerlilik/yetki kontrolünü ayrıca yapar.
 */

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → taslak yükleme efekti
/// </remarks>
export function consumeNewStartParam(search: string): { isNewStart: boolean; remainingSearch: string } {
  const params = new URLSearchParams(search);
  const isNewStart = params.get("new") === "true";
  if (isNewStart) params.delete("new");
  const rest = params.toString();
  return { isNewStart, remainingSearch: rest ? `?${rest}` : "" };
}

export interface FileNumberReopenInput {
  /** Taslaktaki dosya no (yoksa boş) */
  readonly draftFileNumber: string | null | undefined;
  /** Taslağın kaydettiği son otomatik öneri; `undefined` = alan yok (bu düzeltmeden önceki taslak) */
  readonly draftAutoFileNumber: string | null | undefined;
  /** Güncel otomatik öneri */
  readonly suggestion: string;
}

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → loadExistingData (sıradaki dosya no)
/// </remarks>
export function resolveFileNumberOnReopen(input: FileNumberReopenInput): {
  fileNumber: string;
  autoFileNumber: string | null;
} {
  const current = (input.draftFileNumber ?? "").trim();
  if (!current) return { fileNumber: input.suggestion, autoFileNumber: input.suggestion };
  if (input.draftAutoFileNumber === undefined) return { fileNumber: current, autoFileNumber: null };
  if (current === input.draftAutoFileNumber) return { fileNumber: input.suggestion, autoFileNumber: input.suggestion };
  return { fileNumber: current, autoFileNumber: input.draftAutoFileNumber };
}

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → taslak yükleme efekti
/// </remarks>
export function restoreResponsibleSelection(value: unknown): ResponsibleSelection | null {
  // Yalnız şekil; güncel geçerlilik isResponsibleStillCandidate + sunucu
  if (!value || typeof value !== "object") return null;
  const { type, id } = value as { type?: unknown; id?: unknown };
  if ((type !== "LAWYER" && type !== "STAFF") || typeof id !== "string" || !id) return null;
  return { type, id };
}

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → geri yüklenen dosya sorumlusunun güncel aday kontrolü
/// </remarks>
export function isResponsibleStillCandidate(
  selection: ResponsibleSelection,
  candidates: ReadonlyArray<{ type?: unknown; id?: unknown }> | null | undefined,
): boolean {
  return (candidates ?? []).some((c) => c.type === selection.type && c.id === selection.id);
}
