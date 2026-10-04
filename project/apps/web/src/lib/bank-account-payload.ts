// OFFICE-BANK-ACCOUNT (owner kararı 2026-10-03, madde 6) — banka hesabı gönderim yükü.
//
// OKUMA YÜZEYİ (sunucu): yetkili aktöre hesap KİMLİĞİ + varsayılan bilgisi + MASKELİ IBAN. Banka adı / şube / hesap
// sahibi / tam IBAN okuma yüzeyinde YOKTUR. Bu yüzden "Hesap Düzenle" formu kayıtlı değerleri bilmez:
//   - bilinmeyen metin alanında (banka adı, şube, hesap sahibi) BOŞ = "değişmedi" (kayıtlı değer silinmez);
//   - IBAN maskeli gelir; maskeli değer gerçek IBAN diye geri GÖNDERİLMEZ (sunucu da 400 verir);
//   - yalnız kullanıcının GERÇEKTEN değiştirdiği alan gönderilir ("allowlist + tam-form PUT" veri kaybı tuzağı:
//     dar okuma + tam form gönderimi şube ve hesap sahibini siliyordu).
// Sunucu sözleşmesi: apps/api/src/modules/office/dto/office-bank-account.dto.ts.

import { normalizeIban } from "@/lib/lawyer-iban-payload";

export interface BankFormValues {
  bankName: string;
  branchName: string;
  iban: string;
  accountName: string;
  isDefault: boolean;
}

/** Okuma yüzeyinden gelen hesap: bilinmeyen alanlar `undefined`'dır (boş metin DEĞİL). */
export interface KnownBankAccount {
  id?: string;
  bankName?: string;
  branchName?: string | null;
  iban?: string;
  accountName?: string | null;
  isDefault?: boolean;
}

const MASK_CHARACTERS = /[*•·…]/;

/** `true` = boş olmayan, maskesiz IBAN girdisi (sunucudaki `isRealIbanValue` ile aynı sözleşme). */
export function isRealIbanInput(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !MASK_CHARACTERS.test(value);
}

/** Yeni hesap yükü: ekranın bugün gönderdiği beş alan; boş / maskeli IBAN gövdeden ÇIKARILIR. */
export function buildBankAccountCreatePayload(form: BankFormValues): Record<string, unknown> {
  const { iban, ...rest } = form;
  return isRealIbanInput(iban) ? { ...rest, iban: normalizeIban(iban) } : { ...rest };
}

/**
 * Mevcut hesap yükü: YALNIZ değişen alanlar. Boş döner ise gönderilecek bir şey yoktur (istek ÇIKMAZ).
 *
 * - bilinmeyen alan (undefined) + boş girdi → değişmedi; doluysa → gönderilir;
 * - bilinen alan + aynı değer → değişmedi; farklıysa → gönderilir (banka adı boşaltılamaz: zorunlu alan);
 * - IBAN → yalnız gerçek (maskesiz, boş olmayan) ve kayıtlıdan farklıysa;
 * - isDefault → yalnız işaret değiştiyse.
 */
export function buildBankAccountUpdatePayload(original: KnownBankAccount, form: BankFormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of ["bankName", "branchName", "accountName"] as const) {
    const next = (form[key] ?? "").trim();
    const prev = original[key];
    if (prev === undefined) {
      if (next !== "") out[key] = next;
      continue;
    }
    if (next === (prev ?? "").trim()) continue;
    if (key === "bankName" && next === "") continue;
    out[key] = next;
  }

  if (isRealIbanInput(form.iban)) {
    const normalized = normalizeIban(form.iban);
    if (normalized !== original.iban) out.iban = normalized;
  }

  if (form.isDefault !== Boolean(original.isDefault)) out.isDefault = form.isDefault;

  return out;
}
