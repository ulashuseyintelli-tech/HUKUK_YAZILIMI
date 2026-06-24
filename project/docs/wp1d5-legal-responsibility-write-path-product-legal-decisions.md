# WP-1d-5-2 — Legal Responsibility Write-Path Product / Legal Decisions

> **Tür:** DOCS-ONLY karar notu. **Kod YOK · endpoint impl YOK · UI YOK · mutation YOK · migration YOK · schema YOK · audit-write impl YOK · full RBAC YOK · permission store YOK · role template UI YOK · Codex domaini YOK.**
> **Tarih:** 2026-06-25 · **Base:** origin/main `376d71d` · **Kaynak:** [`wp1d5-...-write-path-contract.md`](./wp1d5-legal-responsibility-write-path-contract.md) (#470) + [`wp1d5-...-decision-matrix.md`](./wp1d5-legal-responsibility-write-path-decision-matrix.md) (#471).
> **Codex (girilmez):** NAFAKA / scheduler / DueType / balance / computeBalance / cutover / tahsil / payment-allocation / due-generation / financial-ledger.

## 1. Purpose

Bu doküman #470 contract ve #471 matrix üzerine **karar notudur** — implementation **DEĞİL.** Yeni implementation contract yazmaz, endpoint tasarlamaz; yalnız D1–D4 product/legal kararlarını **kilitler** ve sonraki gate'leri sınırlar. Kararlar Ulaş tarafından verildi (2026-06-25); bu not onları kayıt altına alır.

## 2. Baseline (kısa)

- **Operation owner** (`Case.responsibleLawyerId` XOR `responsibleStaffId`): **devredilebilir.**
- **Legal responsible lawyer** (`CaseLawyer.isResponsible`): **devredilemez**; kayıt **kurallı şekilde değiştirilir** (yapısal lawyer-only; app-layer tam-1).
- Codex domaini dışarıda · WP-4 full RBAC kapalı.

## 3. Decision Summary

| ID | Topic | Decision | Status | Impl. allowed now? | Next gate |
|---|---|---|---|---|---|
| **D1** | Operation owner re-clear (sahipsiz'e geri çekme) | ŞİMDİLİK YOK | `DECIDED_NO_FOR_NOW` | **NO** | (ileride ayrı ürün kararı, gerekirse) |
| **D2** | Hukuki sorumlu avukat değişimi | İZİN VAR, ama "devir" değil — kontrollü kayıt değişikliği | `DECIDED_ALLOWED_AS_CONTROLLED_RECORD_CHANGE` | **NO** | WP-1d-5-3 endpoint/audit contract (docs) |
| **D3** | Birinci-sınıf legal-responsible endpoint | EVET, gerekli (D2 contract sonrası) | `DECIDED_YES_AFTER_D2_CONTRACT` | **NO** | WP-1d-5-3 endpoint/audit contract (docs) |
| **D4** | DB-level exactly-one hardening | ŞİMDİLİK YOK / defer | `DEFERRED_PENDING_DATA_AND_MIGRATION_DESIGN` | **NO** | (ileride) DB invariant hardening forensic + migration design |

## 4. D1 — Operation Owner Re-Clear

**Karar:** `DECIDED_NO_FOR_NOW`. **Implementation allowed now: NO.**

Mevcut model korunur:
- create sırasında ownerless mümkün kalır;
- assign/transfer sonrası **clear-to-none yok**;
- sahipsize geri çekme şu an açılmayacak.

Gerekçe: atanmış dosyayı tekrar "sahipsiz" yapmak operasyonel boşluk (sorumsuz aktif takip) üretir. İleride gerekirse **ayrı ürün kararı + zorunlu reason + açık audit** ile açılır.

## 5. D2 — Legal Responsible Lawyer Change

**Karar:** `DECIDED_ALLOWED_AS_CONTROLLED_RECORD_CHANGE`. **Implementation allowed now: NO** (önce endpoint/audit contract gate'i gerekir).

> **Kanonik ifade:** "Hukuki sorumlu avukat **devredilmez**; hukuki sorumlu avukat **kaydı kurallı şekilde değiştirilir**."

**Asgari kurallar (kilitli):**
- yalnız **Lawyer** olabilir; **Staff'e atanamaz**;
- hedef lawyer **aynı tenant** içinde olmalı;
- hedef lawyer **case'e bağlı `CaseLawyer`** olmalı; **ilk sürümde** case'e bağlı olmayan lawyer **otomatik eklenmez**;
- eski responsible lawyer **demote** edilir; yeni lawyer responsible yapılır; **tam-1 invariant korunur**;
- **reason/note ZORUNLU**;
- **explicit audit ZORUNLU**;
- **temporal history** bu değişimi açık ve **EVENT_CONFIRMED** okuyabilmeli.

**Yetki (kilitli):** ilk sürüm **ADMIN-only hard guard**. Full RBAC / permission store / role template UI **açılmaz**.

**Onay zinciri (kilitli):** ilk sürümde çok-adımlı approval workflow **yok**; **admin-only + zorunlu reason + audit** asgari guard olarak kabul edilir.

## 6. D3 — First-Class Legal Responsible Endpoint

**Karar:** `DECIDED_YES_AFTER_D2_CONTRACT`. **Implementation allowed now: NO.**

Yön (kilitli):
- bu action **CaseLawyer CRUD yan etkisi olmaktan çıkarılacak**; ayrı **explicit action** olarak tasarlanacak;
- olası endpoint adı **yalnız tasarım adayı**: `PATCH /cases/:id/legal-responsible-lawyer` (implementation contract gibi yazılmaz/dondurulmaz);
- payload'da **lawyerId + reason/note zorunlu**; hedef lawyer **case'e zaten bağlı** olmalı; **audit event açık** olmalı.

Sonraki olası gate: **WP-1d-5-3 — endpoint/audit contract (DOCS-ONLY)**. Implementation gate henüz açılmaz.

## 7. D4 — DB-Level Exactly-One Hardening

**Karar:** `DEFERRED_PENDING_DATA_AND_MIGRATION_DESIGN`. **Implementation allowed now: NO.**

- mevcut **app-layer tam-1 invariant** (`planResponsible` + drift-fix) korunur;
- DB `@@unique`/partial-unique **şimdi açılmaz** (migration + runtime data audit + DB-specific partial-unique tasarım gerekir; mevcut veride çoklu/sıfır responsible kalıntısı bilinmeden riskli);
- ileride ayrı gate olabilir: **WP-1d-5-x DB invariant hardening forensic + migration design** — şimdi değil.

## 8. Authorization Stance

- İlk legal-responsible-change implementation için **ADMIN-only hard guard**.
- **No full RBAC** · **no permission store** · **no role template UI** ([[wp4z-authorization-strand-closure-note]] korunur).

## 9. Explicitly Still Blocked

Karar verilmiş olsa da aşağıdakiler **hâlâ açıkça bloklu** (implementation bu/sonraki docs gate'lerde başlatılamaz):
- operation owner **clear-to-none** implementation
- legal responsible **endpoint** implementation
- legal responsible **UI action**
- legal responsible **audit-write** implementation
- **DB unique migration**
- **full RBAC** reopening

## 10. Next Gates

**Implementation DEĞİL.** Sonraki olası gate (yalnız Ulaş onayıyla):
- **WP-1d-5-3 — Legal Responsible Lawyer Change Endpoint + Audit Contract** · **TÜR: DOCS-ONLY** · kod yok.
- Alternatif: **pause.**

Kod gate'i hâlâ erken; D2 endpoint/audit sözleşmesi yazılmadan implementation başlamaz.

## 11. Non-Goals

Kod YOK · endpoint implementation YOK · UI YOK · mutation YOK · migration YOK · schema YOK · audit-write impl YOK · full RBAC YOK · permission store YOK · role template UI YOK · Codex domaini YOK.

---

## DECISION

**`DECISIONS_RECORDED`** — D1 (`DECIDED_NO_FOR_NOW`) · D2 (`DECIDED_ALLOWED_AS_CONTROLLED_RECORD_CHANGE`) · D3 (`DECIDED_YES_AFTER_D2_CONTRACT`) · D4 (`DEFERRED_PENDING_DATA_AND_MIGRATION_DESIGN`).

**`IMPLEMENTATION_STILL_BLOCKED_PENDING_ENDPOINT_AUDIT_CONTRACT`** — hiçbir write/endpoint/UI/migration/audit-impl başlatılmaz; sıradaki adım (yalnız onayla) docs-only WP-1d-5-3 endpoint/audit contract'tır.

**Kod yazılmadı.**
