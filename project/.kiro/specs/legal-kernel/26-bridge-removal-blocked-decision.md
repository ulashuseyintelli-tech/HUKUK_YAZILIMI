---
status: decision-record
type: decision
phase: 2
date: 2026-06-10
review-trigger: "outbox-tenancy tasarım/şema kararı tamamlanınca — bridge removal yeniden değerlendirilir"
purpose: "v28 TimelineService.addEntry tenantId bridge fallback'inin neden bu strand'de KALDIRILAMAYACAĞINI belgeler. Read-only forensic sonucu; kod/şema/migration YOK."
---

# 26 — Bridge Removal Blocked by Outbox-Tenancy — Decision Record

**Karar durumu:** decision-record (read-only forensic)
**Kırmızı çizgiler:** No schema · No migration · No outbox tenancy change · No fail-open tenant risk
**Bağlam:** spec-15 §1 (timeline tenant isolation, Writer B bridge fallback) + `90-future-work/deferred/v28-timeline-aggregate-version-gap.md` (v28 gap, PR #32'de kapandı).

> Bu belge yalnız KARARDIR. Kod, fallback kaldırma, threading, şema değişikliği bu belgeyle başlamaz.

---

## 1. İncelenen şey

v28 `TimelineService.addEntry` (`timeline.service.ts`) hâlâ bir **geçici köprü (bridge)** içeriyor:
`params.tenantId` verilmezse `caseId → case.tenantId` per-insert lookup ile türetir (spec-15 §1
"TODO(bridge): remove after v28 threading", sunset hedefi Sprint 2D sonu). Bu strand'in hedefi:
bridge'i kaldırıp tüm yazıcıları explicit tenantId threading'e geçirmek **mümkün mü** — read-only
forensic ile kanıtlamak.

## 2. Bulgular (koddan doğrulandı, 2026-06-10)

**19 `addEntry` çağrı noktası:**

| Servis | Çağrılar | tenantId? | Kaynak |
|--------|----------|-----------|--------|
| uyap-event-ingest | :70, :89 | ✅ (2) | boundary'de caseId→case.tenantId çözülüp thread'lenir (spec-15 Writer B) |
| engine-runner | :132, :173, :198, :230, :241, :278 | ✅ (6) | uyap-event-ingest'ten thread'lenen `tenantId` param'ı |
| action-handler | :115, :161, :200, :284 | ❌ (4) | outbox satırından (`action.caseId`); tenantId scope'ta yok |
| seed | :46, :56, :77, :110, :149 | ❌ (5) | demo/test üretimi; tenantId geçilmiyor |
| action-feedback | :96, :118 | ❌ (2) | callback (`case_id`); tenantId scope'ta yok |

**Özet:** 8 çağrı tenantId thread'li · **11 çağrı bridge fallback'e bağımlı.**

**Ek bulgular:**
- action-handler / action-feedback / seed servisleri **`tenantId`'ye HİÇ referans vermiyor** — scope'larında yok; threading "var olan param'ı geçir" değil, sıfırdan iş.
- action-handler (4) + action-feedback (2) = **worker/callback path'leri**: outbox kuyruğundan / callback'ten beslenir.
- `IcrabotOutboxAction` tablosunda **tenantId kolonu YOK** (schema.prisma:5570). Worker'ların tenantId'yi elde etmesinin tek yolları:
  - (a) `IcrabotOutboxAction`'a tenantId eklemek → **schema/migration (KIRMIZI ÇİZGİ)**, veya
  - (b) worker boundary'sinde caseId→tenant lookup → bridge'i **kaldırmaz, yerini değiştirir** (per-row lookup pattern aynen kalır).

## 3. Karar

**Mevcut kısıtlar altında bridge KALDIRILMAZ.**

- 11/19 çağrı tenantId taşımıyor → fallback kaldırmak bu satırlara `tenantId=null` yazdırır =
  **fail-open tenant izolasyonu.** Bu bir bug fix değil, tenant-izolasyon bug'ı ÜRETİR.
- Fallback, şu an bu 11 yazımı tenant-doğru tutan **tek mekanizma**; korunmalıdır.
- Bridge removal, `IcrabotOutboxAction` + callback path'lerinin tenant-taşıma kararına bağımlıdır;
  bu da şema değişikliği gerektirir → bu strand'in kırmızı çizgilerinin dışındadır.

## 4. Kapsam dışı (bu strand)

- aggregateVersion hattı (PR #31/#32'de kapandı — `AggregateVersionAllocator`, shared).
- shared allocator değişikliği.
- schema / migration / outbox tenancy değişikliği.

## 5. Ön-koşul (bridge removal'ın açılması için)

Bkz. yeni backlog strand: `90-future-work/deferred/outbox-tenancy-then-bridge-removal.md`.
Sıra: **outbox-tenancy design/şema kararı → SONRA bridge removal.** Ön-koşul çözülmeden bridge
removal planı yapılmaz.

## 6. Reddedilen alternatifler

- **B — Kısmi (yalnız seed thread'le + bridge daralt):** worker path'leri yine fallback'te kalır;
  eleminasyon olmaz, sınırlı değer. Reddedildi (yarım iş, net kapanış yok).
- **C — Outbox-tenancy spec'ini bu strand'de aç:** kırmızı çizgileri (no schema) gevşetmeyi
  gerektirir. Reddedildi (kapsam kirlenmesi); ayrı strand'e taşındı (§5).

---

**Decision Status:** Bridge removal **BLOCKED by outbox-tenancy** (2026-06-10). Fallback korunur.
Kod/şema/migration yok. Yeniden değerlendirme: outbox-tenancy kararı sonrası.
