---
status: risk-documented
type: known-debt
scope: audit-integrity
review-trigger: "INTEREST_POLICY_ASSIGNED payload bir tüketici tarafından okunmaya başlanırsa DERHAL; veya dto→config CaseType mapping domain kararı verilince fix planı"
phase: 2
date: 2026-06-07
purpose: "case.service INTEREST_POLICY_ASSIGNED emit'inde iki ayrı CaseType enum'u arasında mapping olmaması nedeniyle resolveInitialPolicy(dto.type)'ın daima default stratejiye düşmesi. Audit-integrity borcu olarak kayıt. Read-only forensic sonucu; fix/mapping/type-cast İÇERMEZ."
---

# 24 — Interest-Policy CaseType Mapping Risk (Audit-Integrity Debt)

**Durum:** risk-documented
**Tür:** known-debt
**Kapsam:** audit-integrity (canlı faiz hesabı DEĞİL)
**Kaynak:** §5-tarzı read-only forensic (2026-06-07), CI annotation'larından (`tsc --noEmit -p tsconfig.prod.json`, non-blocking) tetiklendi.
**İlgili commit:** `1a5314f` (PR #11 — INTEREST_POLICY_ASSIGNED emit). Kadim pre-existing değil; bu strand'de girdi.

> Bu belge yalnız RİSK KAYDIDIR. Kod, fix, mapping, type-cast veya test bu belgeyle başlamaz. Implementation blocked.

---

## 1. Bulgu (özet)
`case.service.ts:918` → `payload: resolveInitialPolicy(dto.type, {...})`.
- `dto.type` tipi = `case/dto/case.dto.CaseType`.
- `resolveInitialPolicy` beklediği = `interest-engine/interest-strategy.config.CaseType`.
- İki enum **tamamen ayrık** (ortak değer yok) → çağrı her zaman eşleşmeyen değer geçiriyor → `getInterestStrategy` `default:` dalına düşüyor → **her case için DEFAULT policy** üretiliyor.
- CI `tsc --noEmit -p tsconfig.prod.json` bu hatayı verir (TS2345 + TS2322) ama adım `continue-on-error: true` (non-blocking) → build kırılmaz, annotation kalır.

## 2. Consumer matrix
| Artifact | Payload okuyor mu? | Rol |
|---|---|---|
| `case.service.ts:904-918` | — | PRODUCER (emit) |
| `domain-event-ingest.service.ts:47` | Hayır | Validasyon kuralı (`HUMAN_REQUIRED_EVENTS`); timeline/outbox'a yazar, payload'u yorumlamaz |
| Calc engine / segment-builder / interest-engine.service | Hayır | Policy'yi AYRI çözer (§3) |
| Report / preview | Hayır | `allocationPolicyId`/`interpretationProfileId`/`rateSeriesSource` okuyan sıfır sonuç |
| **Toplam consumer** | **0** | Payload geri-okunmuyor |

`resolveInitialPolicy` çağıranı: yalnız `case.service:918`. Fonksiyonun tek amacı bu event payload'u.

## 3. Authoritative vs audit-only
**AUDIT-ONLY.** INTEREST_POLICY_ASSIGNED write-only timeline/audit fact'tir.
Otoriter faiz policy path'i AYRI ve sağlam: `strategy-selector.service` + `policy-gate.service` → `getInterestStrategy(config.CaseType)`. CalculationRequest `caseType`'ı doğrudan `config.CaseType` taşır (`calculation.types.ts:116`), bilinmeyen tipte fail-fast. Event'ten bağımsız.

## 4. Severity
| Eksen | Seviye |
|---|---|
| **Canlı faiz hesabı** | 🟢 Düşük — otoriter path event'ten bağımsız, etkilenmiyor |
| **Audit/event doğruluğu** | 🟠 Orta — her case'e default policy kaydediliyor; `caseTypeClassification` dto değerini taşırken policy alanları default → tutarsız audit kaydı (event-sourced legal-kernel'de kayıt-bütünlüğü borcu, şu an latent) |

## 5. Kök neden
1. İki ayrı `CaseType` enum'u:
   - `case.dto.CaseType` (operasyonel/DB): `GENERAL_EXECUTION, MORTGAGE, PLEDGE, BANKRUPTCY, CHECK, BOND, RENTAL, OTHER`.
   - `interest-strategy.config.CaseType` (hukuki strateji): `KAMBIYO_CEK, KAMBIYO_BONO, KAMBIYO_POLICE, ILAMSIZ_GENEL, ILAMSIZ_KIRA, ILAMSIZ_NAFAKA, ILAMLI, IPOTEK, REHIN, TTK_1530_SUPPLY`.
2. İkisi arasında **mapping yok** (interest-engine, `case.dto.CaseType`'ı import etmiyor).
3. `resolveInitialPolicy(dto.type)` → `getInterestStrategy` `default:` → her case'e default policy.

## 6. Yasak (ön karar)
```
`as unknown as CaseType` (veya benzeri) type-cast ile tip hatasını SUSTURMAK YASAK.
Cast, tipi susturur ama runtime default-davranışını korur → audit verisi yanlış kalır.
Sorun tip değil, DOMAIN MAPPING'tir.
```

## 7. Açık domain kararları (fix öncesi, hukuki/domain input gerekir)
- `BANKRUPTCY` → config.CaseType'ta net karşılık yok.
- `OTHER` → hangi stratejiye/varsayılana?
- dto'da karşılığı olmayan config tipleri (`KAMBIYO_POLICE`, `ILAMSIZ_NAFAKA`, `ILAMLI`, `TTK_1530_SUPPLY`) → tek-yön eşleme; bunlar dto.type'tan üretilemez.
- Açık olanlar (öneri, onay gerekir): `CHECK→KAMBIYO_CEK`, `BOND→KAMBIYO_BONO`, `MORTGAGE→IPOTEK`, `PLEDGE→REHIN`, `RENTAL→ILAMSIZ_KIRA`, `GENERAL_EXECUTION→ILAMSIZ_GENEL`.

## 8. Fix gate (sıra kilitli — implementation BLOCKED)
1. **Mapping kararı** — dto.CaseType → config.CaseType eşlemesi (domain/legal input; §7 açık kararları).
2. **Characterization** — resolveInitialPolicy'yi dto tipleriyle pinle (`resolve-initial-policy.spec.ts` genişletilebilir); mevcut default-davranış kilitlenir, mapping sonrası bilinçli güncellenir.
3. **Event payload doğrulaması** — emit edilen INTEREST_POLICY_ASSIGNED payload'unun beklenen policy'yi taşıdığını doğrula.
4. **TS2322 (index signature)** — ayrı, trivial düzeltme (payload tipine index signature / hedef daraltma).
5. **CI tsc politikası** — non-blocking kalsın mı yoksa blocking mi (broken-windows) — ayrı karar.
6. **Sonra** implementation (ayrı PR, açık onayla).

## 9. İlişki
- legal-time strand'inden BAĞIMSIZ (TZ/day-count değil). Ortak nokta: ikisi de interest-engine politika doğruluğu.
- TBK100 (doc 18) ile karıştırılmamalı.

---
**Risk Status:** risk-documented (audit-integrity). Canlı hesap etkilenmiyor. Fix gated (mapping domain kararı). Implementation NOT authorized. Type-cast forbidden.
