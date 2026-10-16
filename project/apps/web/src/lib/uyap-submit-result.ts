// Güvenlik paketi 01 / DV-198/e (owner Ek 94) — UYAP arayüz doğruluğu: ortak, saf yardımcılar.
//
// (1) GENEL EVRAK TÜRLERİ: `POST /uyap/document/submit` genel evrak ucudur. Haciz Talebi bu uçta
//     sunucuda reddedilir (400 UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED); Takip Talebi yalnız XML
//     gönderim yolundadır (400 UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED, API tarafında). Bu yüzden
//     ikisi genel evrak seçeneklerinde YOKTUR — kullanıcıya her zaman reddedilecek bir seçenek
//     sunulmaz. Tür TİP DÜZEYİNDE de dışlanır: listeye geri eklenmeleri derleme hatası verir.
//
// (2) YANIT SINIFLANDIRMASI: bugün gerçek UYAP taşıması YOKTUR; başarılı yanıt yerel
//     simülasyondur (`data.simulated === true`, `data.dispatched === false`). Arayüz iletim
//     iddiasını YALNIZ sunucunun açık `dispatched === true` beyanına dayandırır. Alan yoksa veya
//     biçim beklenmedikse sonuç DOĞRULANAMADI sayılır — ne iletim ne simülasyon iddia edilir.

import type { UyapDocumentType } from './api';

/** Genel evrak ucunda gönderilebilen türler (Haciz Talebi ve Takip Talebi DIŞLANIR). */
export type UyapGeneralDocumentType = Exclude<UyapDocumentType, 'HACIZ_TALEBI' | 'TAKIP_TALEBI'>;

export const UYAP_GENERAL_DOCUMENT_TYPES: ReadonlyArray<{ value: UyapGeneralDocumentType; label: string }> = [
  { value: 'DILEKCE', label: 'Dilekçe' },
  { value: 'BEYAN', label: 'Beyan' },
  { value: 'ITIRAZ', label: 'İtiraz' },
  { value: 'DIGER', label: 'Diğer' },
];

/** Varsayılan: kalan listenin ilk geçerli türü (genel evrak ucunun en genel kullanımı dilekçedir). */
export const UYAP_GENERAL_DOCUMENT_DEFAULT: UyapGeneralDocumentType = 'DILEKCE';

/**
 * - DISPATCHED: sunucu `success:true` + `data.dispatched === true` beyan etti (bugün ulaşılamaz).
 * - SIMULATED : sunucu `success:true` + `data.simulated === true` + `data.dispatched === false`.
 * - REJECTED  : sunucu gövdede `success:false` döndü.
 * - UNVERIFIED: diğer her şey (alan yok, bozuk tip, çelişkili beyan) — iletim iddia EDİLMEZ.
 */
export type UyapSubmitResultKind = 'DISPATCHED' | 'SIMULATED' | 'REJECTED' | 'UNVERIFIED';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function classifyUyapSubmitResult(response: unknown): UyapSubmitResultKind {
  const body = asRecord(response);
  if (!body) return 'UNVERIFIED';
  if (body.success === false) return 'REJECTED';
  if (body.success !== true) return 'UNVERIFIED';
  const data = asRecord(body.data);
  if (!data) return 'UNVERIFIED';
  if (data.dispatched === true && data.simulated !== true) return 'DISPATCHED';
  if (data.simulated === true && data.dispatched === false) return 'SIMULATED';
  return 'UNVERIFIED';
}
