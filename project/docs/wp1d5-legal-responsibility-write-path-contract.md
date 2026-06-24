# WP-1d-5-0 — Legal Responsibility Write-Path Contract

> **Tür:** DOCS-ONLY sözleşme. **Kod YOK · endpoint YOK · UI YOK · mutation YOK · migration YOK · schema YOK · audit implementation YOK · full RBAC YOK · Codex domaini YOK.**
> **Tarih:** 2026-06-24 · **Base:** origin/main `23f787a` · **Yöntem:** mevcut model/kod/test'ler **okunarak** doğrulandı (tahmin yok).
> **Anchor'lar:** [[wp1d4-temporal-responsibility-ui-strand-closure-note]] · `wp1d4c-responsibility-history-endpoint-contract.md` · `case-responsibility-model-design.md` · [[wp4z-authorization-strand-closure-note]].
> **Sınır:** Yalnız Legal Responsibility architecture. NAFAKA/scheduler/DueType/balance/cutover/tahsil/payment-allocation/due-generation/financial-ledger = **Codex (girilmez)**.

## 1. Purpose

Sorumluluk **okuma** hattı kapandı (#422→#461). Bu doküman **write-path sözleşmesini** (atama/devir/değişiklik semantiği, audit, temporal etki, terminoloji, legal-hard-guard ilkeleri) **kod yazmadan** sabitler. Çıktı bir tasarım sözleşmesidir; uygulama ayrı, onaylı gate'lerde yapılır.

İki yazma ekseni:
- **Dosya Operasyon Sorumlusu** (operasyonel; devredilebilir) — `Case.responsibleLawyerId` XOR `responsibleStaffId`.
- **Hukuki Sorumlu Avukat** (hukuki sıfat; devredilemez) — `CaseLawyer.isResponsible`.

Kapsam dışı (karıştırma yasağı): `CaseStaff.roleOnCase` (Dosya Ekibi Rolü) · `Case.sorumluPersonelId` (Eski/Legacy Sorumlu Personel, yalnız okuma fallback).

## 2. Existing Read Model Baseline (doğrulandı)

- **Owner okuma:** `ResponsibleCandidatesService.getCaseResponsiblePerson` → responsibleLawyer/Staff öncelik; yoksa legacy `sorumluPersonel` (isLegacy=true); yoksa null. Adaylar: aktif Lawyer (`canBeResponsible`) + aktif StaffMember.
- **Temporal okuma:** `GET /cases/:id/responsibility-at` (point-in-time) + `GET /cases/:id/responsibility-history` (timeline) — salt-okuma, AuditLog replay, confidence-dürüst (EVENT_CONFIRMED / INFERRED_FROM_SNAPSHOT / UNKNOWN_BEFORE_HORIZON).
- **Owner audit (mevcut):** create → `changeType: OPERATION_OWNER_INITIALIZED`; assign → `changeType: OPERATION_OWNER` (entityType CASE). **AuditLog tek otorite — OwnerChangeHistory tablosu YOK.**
- **Legal-responsible audit (mevcut):** `CASE_LAWYER` event'leri (isResponsible geçişleri); `metadata.caseId` varsa güvenilir (EVENT_CONFIRMED), yoksa canlı junction fallback (INFERRED).

## 3. Canonical Responsibility Types

| Eksen | Alan | Kişi tipi | Çokluk | Devredilebilir? |
|---|---|---|---|---|
| Dosya Operasyon Sorumlusu | `Case.responsibleLawyerId` XOR `responsibleStaffId` | Lawyer **veya** StaffMember | en fazla 1 (XOR; both-null = sahipsiz/meşru) | **EVET** (operasyonel) |
| Hukuki Sorumlu Avukat | `CaseLawyer.isResponsible` | **yalnız Lawyer** (yapısal: CaseLawyer bir Lawyer'a bağlanır; staff CaseLawyer olamaz) | **tam 1** (app-invariant `planResponsible`; DB `@@unique` yok) | **HAYIR** (hukuki sıfat staff'e devredilemez) |
| (Kapsam dışı) Eski Sorumlu Personel | `Case.sorumluPersonelId` | User | 0/1 | — (legacy, salt-okuma) |
| (Kapsam dışı) Dosya Ekibi Rolü | `CaseStaff.roleOnCase` | StaffMember | çoklu | — (ekip rolü, sorumluluk değil) |

## 4. Operation Owner Write Contract

**Mevcut (doğrulanmış) yazma yolları:**
- **Create** (`POST /cases`): `validateResponsibleSelection({allowNone:true})` → en fazla bir; both-null = sahipsiz (meşru). DB CHECK both-set'i engeller. Audit `OPERATION_OWNER_INITIALIZED` (temporalOrigin).
- **Assign / Transfer** (`PATCH /cases/:id/responsible-person`, `ResponsibleCandidatesService.assignResponsiblePerson`): `validateResponsibleSelection({allowNone:false})` → **exactly-one**; both-set→400, none→400, geçersiz/pasif/cross-tenant aday→400. Seçilen tip yazılır, **diğer alan null'lanır**. Audit `OPERATION_OWNER` (old→new + actor userId). `sorumluPersonelId`'e dokunulmaz.

**Sözleşme kuralları (sabit):**
- XOR değişmez: aynı anda hem lawyer hem staff owner OLAMAZ (DTO + validator + DB CHECK üç katman).
- **assign = transfer:** owner değişimi yeni kişiyi yazıp eskiyi nullar (ayrı "clear+set" değil). Devir doğal olarak desteklenir.
- Actor (`userId`) ZORUNLU; her owner değişimi audit'e old→new yazılır (AuditLog tek otorite).
- Owner **sahipsiz** kalabilir (both-null meşru) — ama bu YALNIZ create'te üretilir.

**Açık boşluk (gap):** Create sonrası owner'ı **tekrar sahipsize çekme** (re-clear) write yolu **YOK** (assign exactly-one zorlar). Bu bilinçli mi, yoksa "owner kaldır" aksiyonu gerekli mi? → §10 (NEEDS_PRODUCT_DECISION).

## 5. Legal Responsible Lawyer Write Contract

**Mevcut (doğrulanmış) yazma yolları:** Hukuki Sorumlu Avukat'ın değişimi **birinci-sınıf bir aksiyon DEĞİL**; `CaseLawyer` yönetiminin yan-etkisidir:
- **Create** (`POST /cases`): loop sonrası `planResponsible(preferId=null)` ile dedupe → tam 1 (rank önceliği PARTNER>MANAGER>AUTHORIZED>LAWYER>INTERN). "≥1 sorumlu" invariant'ı sorumlu seçilmeden açılırsa fallback atar.
- **Add/Update CaseLawyer**: hedef sorumlu yapılırken inline "tam 1" → diğer sorumlular demote (`isResponsible=false`, `role=ASSIGNED`). Explicit `preferId` (kullanıcı seçimi) korunur.
- **Remove CaseLawyer** (`DELETE /cases/:id/lawyers/:id`): sorumlu silinirse `resolveResponsiblePromotion` ile kalanlardan rank önceliğiyle fallback promote.

**Sabit invariant'lar (doğrulandı):**
- **Yapısal lawyer-only:** `CaseLawyer` daima bir Lawyer'a bağlanır → hukuki sorumlu **asla staff olamaz** (devredilemezlik yapısal olarak korunur). Bu, owner ekseninden (staff olabilir) temel farktır.
- **Tam 1 sorumlu avukat** (lawyers varsa): `planResponsible` + create dedupe + invariant spec'ler ile app-katmanı garanti (DB `@@unique` yok; drift-fix scripti mevcut).

**Tasarım eksiği / ana yeni yüzey:** "Hukuki Sorumlu Avukat değişikliği" şu an genel CaseLawyer yönetiminin **yan-etkisi** olarak gerçekleşiyor; **kendine ait, açık, güvenilir audit'li ve hard-guard'lı bir aksiyon değil.** Hukuki sıfat devredilemez/özel olduğundan, bu değişiklik **"basit assignment" gibi modellenmemeli.** Sözleşme önerisi:
- Hukuki Sorumlu Avukat değişimi **ayrı bir kavram** olarak ele alınmalı ("hukuki sorumlu avukat kaydı değişikliği"), genel ekip-yönetimi mutasyonundan ayrışmalı.
- Kendi **explicit audit event'ini** emit etmeli (ör. `changeType: LEGAL_RESPONSIBLE_LAWYER`), CASE_LAWYER yan-event'lerine bel bağlamamalı (history güvenilirliği için).
- Staff'e atama girişimi **reddedilmeli** (yapısal zaten imkânsız; sözleşme düzeyinde de açık ret).
→ Bu, write gate'inde tasarlanacak; bu docs gate yalnız ilkeyi sabitler. §10 (NEEDS_LEGAL_DECISION: hukuki sorumlu değişimi kimin yetkisinde + onay zinciri).

## 6. Audit and Temporal Requirements

- **AuditLog tek otorite** (yeni tablo/migration YOK) — owner ve legal-responsible değişimi için geçerli.
- Her yazma: `old→new` + actor `userId` + tenant + `metadata.changeType`.
- changeType sözleşmesi: owner create=`OPERATION_OWNER_INITIALIZED` · owner assign/transfer=`OPERATION_OWNER` · (önerilen) legal-responsible değişimi=`LEGAL_RESPONSIBLE_LAWYER` (yeni; write gate'inde).
- **Temporal etki:** owner event'leri zaten `responsibility-at`/`responsibility-history` tarafından EVENT_CONFIRMED okunur. Legal-responsible için explicit changeType + `metadata.caseId` → history'de güvenilir (EVENT_CONFIRMED) okuma; aksi halde INFERRED. Write tasarımı bu güvenilirliği hedeflemeli.
- Yanlış kesinlik YASAK: write tarafı, read tarafının confidence semantiğini bozacak biçimde geçmişi yeniden yazmaz (no backfill bu gate'te).

## 7. Terminology Rules

- "Sorumlu" **tek başına kullanılmaz.**
- **Dosya Operasyon Sorumlusu** = operasyonel owner (lawyer veya staff).
- **Hukuki Sorumlu Avukat** = `CaseLawyer.isResponsible` (yalnız avukat).
- **Eski/Legacy Sorumlu Personel** = `Case.sorumluPersonelId` — yalnız legacy bağlamında ("Eski sorumlu (kullanıcı hesabı)").
- **Dosya Ekibi Rolü** = `CaseStaff.roleOnCase` — sorumluluk DEĞİL; karıştırılmaz.
- **Görev Atanan / Görevi Kapatan** (`Task.assigneeId` / `completedByUserId`) = görev kavramı; sorumlulukla karıştırılmaz.

## 8. Authorization / Legal-Hard-Guard Principles

- **Operasyonel yetki devredilebilir:** Dosya Operasyon Sorumlusu değiştirilebilir (lawyer↔staff dahil), operasyonel akış.
- **Hukuki sıfat devredilemez:** Hukuki Sorumlu Avukat staff'e atanamaz (yapısal olarak imkânsız + sözleşmede açık ret); değişimi sıradan bir assignment gibi davranamaz.
- **Legal-responsible değişimi ayrı yetki + ayrı audit gerektirir** (ilke). Bunun *enforcement*'ı (kim yapabilir) bu gate'te uygulanmaz.
- **WP-4 full RBAC / permission store / role template UI AÇILMAYACAK** (good-enough checkpoint korunur; [[wp4z-authorization-strand-closure-note]]). Enforcement gereği doğarsa ayrı, ihtiyaç-gated gate.
- **Mevcut durum (dürüst):** owner assign + CaseLawyer mgmt şu an **tenant-scoped** (rol-bazlı guard yok). Legal-hard-guard ilkesi henüz enforce EDİLMİYOR; sözleşme ilkeyi kayıt altına alır, enforcement'ı ayrı gate'e bırakır.

## 9. Explicit Non-Goals

UI YOK · endpoint YOK · mutation YOK · migration YOK · schema YOK · audit implementation YOK · backfill YOK · full RBAC / permission-store / role-template UI YOK · drift-fix çalıştırma YOK · Codex domaini (NAFAKA/scheduler/balance/tahsil/...) YOK.

## 10. Open Questions

1. **(NEEDS_PRODUCT_DECISION)** Owner'ı create sonrası **sahipsize geri çekme** ("owner kaldır") write yolu gerekli mi? Şu an assign exactly-one; sahipsiz yalnız create'te. 
2. **(NEEDS_LEGAL_DECISION)** Hukuki Sorumlu Avukat değişimi **kimin yetkisinde** olmalı + onay zinciri gerekli mi? (Devredilemez sıfat → özel yetki ilkesi enforcement'ı.)
3. **(NEEDS_PRODUCT_DECISION)** Hukuki Sorumlu Avukat değişimi **birinci-sınıf endpoint** (`PATCH /cases/:id/legal-responsible-lawyer` benzeri, explicit `LEGAL_RESPONSIBLE_LAWYER` audit'li) olarak mı modellenecek, yoksa CaseLawyer mgmt yan-etkisi mi kalacak? (Sözleşme önerisi: birinci-sınıf + explicit audit.)
4. **(NEEDS_PRODUCT_DECISION)** "Tam 1 sorumlu avukat" invariant'ı DB düzeyinde de (`@@unique` parçalı index) sağlamlaştırılsın mı, yoksa app-katmanı yeterli mi? (Şu an yalnız app; drift-fix mevcut.)
5. **(BLOCKED_BY_EXISTING_MODEL_AMBIGUITY?)** — Tespit edilmedi; mevcut model write için tutarlı. Çokluk/XOR/lawyer-only kuralları kod+test ile net.

## 11. Next Gates (öneri, gated; kod yok)

- **WP-1d-5-1 (docs):** Hukuki Sorumlu Avukat **birinci-sınıf değişiklik aksiyonu** tasarımı (explicit audit `LEGAL_RESPONSIBLE_LAWYER` + staff-ret + temporal güvenilirlik) — §5/§10 kararlarına bağlı.
- **WP-1d-5-2 (docs/design):** Owner re-clear ("sahipsiz") write semantiği kararı — §10.1.
- **(Sonra, ayrı):** İlgili UI (atama/devir) — yalnız sözleşme onaylanınca; kodla başlamaz.
- Legal-hard-guard *enforcement* → ihtiyaç doğarsa, WP-4 yeniden açma kriterleriyle.

---

## DECISION

**`WRITE_CONTRACT_READY_FOR_REVIEW`**

Mevcut write modeli (owner: create+assign/transfer, exactly-one/XOR, OPERATION_OWNER audit · legal-responsible: CaseLawyer yan-etkisi, yapısal lawyer-only, tam-1) **doğrulanarak** sözleşmeye geçirildi. Hukuki sıfatın devredilemezliği + terminoloji + audit/temporal ilkeleri sabitlendi.

**Review'a bağlı alt-kararlar (§10):** owner re-clear (NEEDS_PRODUCT_DECISION) · legal-responsible değişimi yetki/onay zinciri (NEEDS_LEGAL_DECISION) · legal-responsible birinci-sınıf endpoint (NEEDS_PRODUCT_DECISION) · invariant DB-sağlamlaştırma (NEEDS_PRODUCT_DECISION).

**Kod yazılmadı.** Sonraki adım: Ulaş review → §10 kararları → ayrı write/design gate'leri.
