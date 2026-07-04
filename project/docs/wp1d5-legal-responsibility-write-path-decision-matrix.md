# WP-1d-5-1 — Legal Responsibility Write-Path Decision Matrix

> **Tür:** DOCS-ONLY karar matrisi. **Kod YOK · endpoint YOK · UI YOK · mutation YOK · migration YOK · schema YOK · audit-write impl YOK · full RBAC YOK · permission store YOK · role template UI YOK · Codex domaini YOK.**
> **Tarih:** 2026-06-24 · **Base:** origin/main `cf6d7b4` · **Kaynak:** [`wp1d5-legal-responsibility-write-path-contract.md`](./wp1d5-legal-responsibility-write-path-contract.md) (#470, merged).
> **Codex (girilmez):** NAFAKA / scheduler / DueType / balance / computeBalance / cutover / tahsil / payment-allocation / due-generation / financial-ledger.

## 1. Purpose

Bu doküman **#470 (WP-1d-5-0) contract'ını implementation'a ÇEVİRMEZ.** Yeni sözleşme icat etmez, #470'i yeniden yazmaz. Yalnız §10'daki dört karar noktasını **ayrı, izlenebilir bir karar matrisine** kilitler ve her birinin **erken uygulanmasını açıkça bloklar.** Kararlar Ulaş'a (product) ve hukukçuya (legal) aittir; bu doküman onları netleştirir, vermez.

## 2. Baseline From WP-1d-5-0 (kısa)

- **Operation owner** = `Case.responsibleLawyerId` XOR `Case.responsibleStaffId` (lawyer veya staff). **Devredilebilir.** Mevcut: create (`allowNone`, sahipsiz meşru) + assign/transfer (`PATCH /cases/:id/responsible-person`, exactly-one); audit `OPERATION_OWNER(_INITIALIZED)`; AuditLog tek otorite.
- **Legal responsible lawyer** = `CaseLawyer.isResponsible`. **Devredilemez**; yapısal olarak **yalnız Lawyer** (staff CaseLawyer olamaz). App-katmanı **tam-1** invariant (`planResponsible`). Bugün **birinci-sınıf aksiyon değil** — CaseLawyer yönetiminin yan-etkisi; kendine ait write changeType/endpoint YOK. (Not: `LEGAL_RESPONSIBLE_MISSING` yalnız WP-3a **read-side** uyarı sinyalidir; write aksiyonu değildir.)
- **WP-4 full RBAC KAPALI** (good-enough checkpoint; [[wp4z-authorization-strand-closure-note]]).

## 3. Decision Matrix

| ID | Topic | Current behavior | Proposed stance | Required decision | Risk if implemented too early | Required evidence before impl | Next possible gate | Status |
|---|---|---|---|---|---|---|---|---|
| **D1** | Operation owner re-clear (sahipsiz'e geri çekme) | create'te ownerless mümkün; assign sonrası **clear YOK** | Mevcut davranışı KORU; ayrı "owner kaldır" aksiyonu açma | NEEDS_PRODUCT_DECISION | Sahipsiz dosyaya geri çekme operasyonel risk (sahipsiz aktif dosya); audit/yetki tanımsız | Ürün kararı: "owner kaldır" gerçekten gerekli mi + kimin yetkisinde + audit shape | WP-1d-5-2 (owner re-clear product decision note) | **BLOCKED_PENDING_PRODUCT** |
| **D2** | Legal responsible lawyer **değişimi** semantiği | CaseLawyer mgmt yan-etkisi; tam-1 inline demote; kendine ait audit/guard YOK | "Devredilmez; **kayıt kurallı şekilde DEĞİŞTİRİLİR**" — birinci-sınıf, hard-guard'lı, açık audit'li, neden/not'lu | NEEDS_LEGAL_DECISION | Basit assignment gibi davranmak hukuki sıfatı zayıflatır; temporal/audit güvenilirliği bozulur | Hukuki karar: kim değiştirebilir + onay zinciri + neden/not zorunlu mu | WP-1d-5-2 (legal responsible change legal/product note) | **BLOCKED_PENDING_LEGAL** |
| **D3** | Birinci-sınıf legal-responsible endpoint | YOK (yan-etki; `PATCH /cases/:id/legal-responsible-lawyer` benzeri mevcut değil) | D2 netleşmeden tasarlanmaz; endpoint adı yalnız **tasarım örneği**, implementation contract DEĞİL | NEEDS_PRODUCT_DECISION + NEEDS_LEGAL_DECISION | Sözleşme netleşmeden endpoint = yanlış audit/guard kalıbını dondurur | D2 kararı + audit changeType (öneri `LEGAL_RESPONSIBLE_LAWYER`) + staff-ret kuralı | (D2 sonrası ayrı design gate) | **BLOCKED_PENDING_PRODUCT_LEGAL** |
| **D4** | DB-level exactly-one hardening (`@@unique`/partial index) | **ERRATA:** at-most-one DB'de **ZATEN var** (partial unique `case_lawyer_one_responsible_per_case (caseId) WHERE isResponsible=true`, #229). App-katmanı **exactly-one** (`planResponsible`+drift-fix). Eksik = **zero-responsible** veri/invariant. | "Sıfırdan DB unique" DEĞİL; exactly-one için ek sertleştirme/veri-denetimi gerekli mi (özellikle zero-responsible) | NEEDS_PRODUCT_DECISION | (at-most-one zaten DB'de) erken zero-responsible/exactly-one migration veri tutarlılığı gerektirir | zero-responsible veri denetimi + exactly-one design | (ileri) zero-responsible data audit + exactly-one design | **`PARTIALLY_ALREADY_HARDENED_AT_DB_LEVEL` + `DEFERRED_FOR_ZERO_RESPONSIBLE_DATA_AUDIT_AND_EXACTLY_ONE_DESIGN`** |

> **ERRATA (2026-06-25, WP-1d-5-4 koddan tespit):** D4'ün orijinal "DB unique YOK" premisi **yanlıştı.** DB **at-most-one**'ı partial unique index ile zaten zorluyor (`case_lawyer_one_responsible_per_case`, #229). Ayrım: **DB partial unique = at-most-one · App invariant = exactly-one · zero-responsible hâlâ ayrı veri/invariant sorusu.** Detay: `wp1d5-legal-responsibility-write-path-product-legal-decisions.md` §7 ERRATA.

## 4. Operation Owner Re-Clear Decision

**Karar:** `NEEDS_PRODUCT_DECISION`.
Mevcut davranış korunur: create sırasında ownerless mümkün; assign/transfer sonrası **clear yok**. Sahipsize geri çekme operasyonel risk üretir (sahipsiz aktif dosya, sorumsuz takip). Gerekirse **ayrı ürün kararı + açık audit** ile ele alınır — bu gate'te açılmaz.

## 5. Legal Responsible Lawyer Change Decision

**Karar:** `NEEDS_LEGAL_DECISION`.

> **Kritik ifade:** "Hukuki sorumlu avukat **devredilmez**; hukuki sorumlu avukat **kaydı kurallı şekilde değiştirilir**."

Bu basit assignment değildir. Gerektirir: **legal-hard-guard** · **açık audit** (kendine ait, güvenilir; öneri changeType `LEGAL_RESPONSIBLE_LAWYER`) · **neden/not opsiyonu** · **temporal doğruluk** (read-side confidence semantiğini bozmadan). Staff'e atama yapısal olarak imkânsız + sözleşmede açık ret. Kim değiştirebilir / onay zinciri → hukuki karar.

## 6. First-Class Legal Responsible Endpoint Decision

**Karar:** `NEEDS_PRODUCT_DECISION + NEEDS_LEGAL_DECISION`.
Şimdilik **kod yok.** Endpoint ancak D2 (legal) + product kararı netleşirse **sonraki ayrı gate** olabilir. Olası ad (`PATCH /cases/:id/legal-responsible-lawyer`) yalnız **tasarım örneği** olarak anılır — implementation contract gibi yazılmaz/dondurulmaz.

## 7. DB-Level Exactly-One Hardening Decision

**Karar:** `NEEDS_PRODUCT_DECISION`.
DB `@@unique`/partial-index, migration + mevcut çoklu-responsible verinin temizliğini gerektirir. Bu PR zincirinde **hemen açılmaz.** Mevcut **app-layer tam-1 invariant** (`planResponsible` + drift-fix) korunur.

## 8. Explicitly Blocked Until Decision

Aşağıdakiler **karar verilene kadar AÇIKÇA bloklu** (bu gate ve sonraki docs gate'lerde başlatılamaz):
- legal responsible **write endpoint**
- legal responsible **UI action**
- legal responsible **audit-write implementation**
- operation owner **clear-to-none** action
- **DB unique migration** (exactly-one hardening)
- **full RBAC** reopening / permission store / role template UI

## 9. Non-Goals

Kod YOK · endpoint YOK · UI YOK · mutation YOK · migration YOK · schema YOK · audit-write impl YOK · full RBAC YOK · permission store YOK · role template UI YOK · Codex domaini YOK.

## 10. Recommended Next Gate

**Implementation DEĞİL.** Sonraki olası gate yalnız şunlardan biri olabilir (ve ancak Ulaş onaylarsa):
- **WP-1d-5-2 — Legal Responsible Change Legal/Product Decision Note** (docs-only; D2/D3'ü hukuki+ürün kararıyla netleştirir), veya
- **WP-1d-5-2 — Operation Owner Re-Clear Product Decision Note** (docs-only; D1), veya
- **"pause until product/legal decision"** (karar gelene kadar bekle).

Karar (D1–D4) verilmeden **implementation gate önerilmez.**

---

## DECISION

**`DECISION_MATRIX_READY`** — #470 §10 kararları D1–D4 olarak sınıflandırıldı, mevcut davranış + erken-uygulama riski + gereken kanıt + sonraki olası gate ile kilitlendi.

**Implementation durumu:** `IMPLEMENTATION_BLOCKED_PENDING_PRODUCT_LEGAL_DECISIONS` — D1 (product) · D2 (legal) · D3 (product+legal) · D4 (product) kararları verilene kadar hiçbir write/endpoint/UI/migration/audit-impl başlatılmaz.

**Kod yazılmadı.** Sonraki adım: Ulaş'ın D1–D4 kararları → ardından (yalnız onayla) docs-only WP-1d-5-2 karar notu/notları.
