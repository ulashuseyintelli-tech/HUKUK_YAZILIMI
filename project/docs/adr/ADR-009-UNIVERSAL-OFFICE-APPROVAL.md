# ADR-009: Universal Office Approval — Durum-Değiştiren Mutation'lar Patron/Kurucu-Ortak Onayından Geçer

**Status:** Accepted (LOCKED)
**Date:** 2026-06-29
**Deciders:** Kurucu ortaklar — Ulaş, Fatma
**Related:** P4 Approval Engine (`OfficeApprovalRequest`, #592/#597/#604/#612/#618/#624/#627), `docs/finance/adr-client-offset-cross-ledger-settlement.md`, Client Intake 4.7d-2 design-gate

## Context

Platform genelinde "durum değiştiren" işlemlerin yetki + denetim modeli tutarsızdı:

- **Client Intake 4.7d-2 bulgusu:** `ClientIntelStatement` mutation'ları (retract / false-positive / supersede) backend'de **yalnız JWT** ile korunuyor (controller `@UseGuards(AuthGuard('jwt'))`); role/capability enforcement YOK ve **AuditLog YOK** (yalnız entity-gömülü `revokedById`/`supersededById` izi). Yani JWT'si olan herhangi bir tenant kullanıcısı istihbaratı doğrudan geri alabiliyor/yanlış işaretleyebiliyor.
- Buna karşılık bazı mutation'ların kendi kontrolü var (ör. `ClientOffset` apply/reverse: PARTNER/MANAGER → 403 + idempotency + immutable event). Yani platformda durum-değiştiren işlemler için **tek bir kontrol modeli yok**.
- P4 Approval Engine (`OfficeApprovalRequest`) zaten MAIN'de ve substrate **bilinçli generic** tasarlanmış (`actionCode`/`targetType`/`targetRef`/`savedIntent` — şema yorumu: "substrate tek modüle bağımlı kalmasın"). CHANGE_STATUS aksiyonu için tam döngü (request → PENDING → onay → deferred executor) CANLI.

Bu ADR, durum-değiştiren işlemler için tek ve tutarlı bir onay modelini sabitler.

## Decision

**Bilgi girişi serbesttir; durum değiştiren / mevcut kaydı etkileyen işlemler yetkisiz aktör için doğrudan kesinleşmez.** Yetkisiz/normal kullanıcı işlemi başlatır → sistem `OfficeApprovalRequest` oluşturur → işlem PENDING olur → kurucu ortak (patron) onaylar → onay sonrası executor gerçek mutation'ı uygular.

**Çekirdek ilke:** *"İşlem yapılır, etkisi oluşmaz; patron onaylayınca kesinleşir."*

- **Kurucu ortak approver grubu:** Ulaş, Fatma.
- **Substrate REUSE:** Bu model `OfficeApprovalRequest` üzerinden ilerler. Aksiyon başına yeni motor YAZILMAZ; yalnız (a) create-path (doğrudan mutate yerine request oluştur) + (b) executor branch (onayda PURE service mutation'ı uygular) eklenir.
- **Audit doğal kazanım:** `OfficeApprovalRequest` requesterUserId / approverUserId / decidedAt / decisionNote / savedIntent / payloadHash → kim istedi / kim onayladı / kim reddetti doğal kayda girer. 4.7d-2'deki audit boşluğu bu modelle kapanır.

### Model ayrımları (KİLİTLİ — karıştırılmaz)

| Model | Rol | Bu ADR'daki yeri |
|---|---|---|
| `OfficeApprovalRequest` | İç / kurumsal / **patron onayı** | Patron Onay Sistemi BUNUN üzerinden ilerler |
| `ClientApprovalRequest` | Dış / **müvekkil** onayı | Patron Onay için **GENİŞLETİLMEZ**; ayrı kalır |

## Kapsam

### Kapsam DIŞI — bilgi girişi (doğrudan, append-only kalır)
- public intake submit · staff review · field promote · `ClientIntelStatement` create · not/açıklama gibi append-only kayıtlar.

### Kapsam İÇİ — durum-değiştiren mutation (approval'a düşer)
- Intel: retract · false-positive · supersede
- Dosya: kapatma · statü değiştirme
- Finansal: tahsilat iptali · ödeme iptali · mahsup apply/reverse (finansal etkili)
- İleride seçilecek diğer kritik mutation'lar (aksiyon-bazlı kararla eklenir)

## Rules

### MUST
1. Yetkisiz/normal aktörün durum-değiştiren işlemi **doğrudan mutate ETMEZ**; `OfficeApprovalRequest` (PENDING) oluşturur.
2. Mutation yalnız **onay sonrası executor** tarafından uygulanır (deferred; PURE service çağrısı).
3. Her yeni aksiyon **ayrı create-path + ayrı executor branch** ile tasarlanır; substrate (model/audit/inbox/idempotency/executionStatus/retry) REUSE edilir.
4. Audit, `OfficeApprovalRequest` alanları üzerinden sağlanır (ayrı ad-hoc audit yazımı gerekmez).

### MUST NOT
1. Mevcut çalışan mutation kontrolleri (ör. `ClientOffset` 403 + immutable event) **kör şekilde** approval'a taşınmaz; her aksiyon ayrı tasarlanır.
2. `ClientApprovalRequest` (dış/müvekkil) bu iç onay modeli için **genişletilmez**.
3. Bu model TM47 muhasebe kavramlarıyla **karıştırılmaz** (statement/cari ≠ approval).
4. Executor desteklemeyen aksiyon kodu sessizce uygulanmaz (typed refusal — mevcut `UNSUPPORTED_ACTION_CODE` deseni korunur).

### SHOULD
1. **Kurucu ortak doğrudan uygulayabilir** veya self-approval gerektirmeden execute eder; bu davranış aksiyon-bazında netleştirilir. (Mevcut P4-3A deseni: non-PARTNER → request, PARTNER → direct.)
2. Hangi aksiyonların onaya gireceği + eşik (ör. tutar) aksiyon-bazında kararlanır; kör "her şey her zaman pending" DEĞİL.
3. **Engine core hardening önce gelir:** retry/stuck handling, unsupported-action guard, executor reliability, audit consistency, idempotency (P4-5C / P4-3B). Yeni aksiyonlara genelleme bundan SONRA sıralanır.

## Intel 4.7d-2 üzerindeki etki
- **4.7d-2b/c (retract / false-positive / supersede UI) BLOCKED kalır:** FE doğrudan `retract` çağırmayacak; `OfficeApprovalRequest` oluşturacak. Bu, intel aksiyonları için approval-backed backend (create-path + executor) gerektirir → o gelene kadar mutation UI yapılmaz.
- **4.7d-2a (read-only inactive visibility + status badge) bu karardan BAĞIMSIZDIR ve yapılabilir** (durumları yalnız gösterir; durumlar ileride approval-executor ile set edilir, UI aynı kalır).

## Bağımlılıklar (P4 / Codex)
- `OfficeApprovalRequest` / office-approval / executor = P4 backend alanı (Codex/owner sahipliği; P4-5B #627 merged, P4-5C/P4-3B AÇIK).
- Bu ADR bir **karar + roadmap**'tir, tek sprint değil. Generalization aksiyon başına backend işidir (Codex/owner-led).
- **Claude'un payı:** ilgili aksiyonun backend create-path + executor'ı hazır olduğunda FE "request oluştur" / Inbox / onay-durumu UI'ı (frontend-only).

## Non-Goals
- Generalization'ı şimdi implement etmek (bu ADR yalnız karar).
- Listelenenler dışındaki aksiyonların kapsamını şimdi sabitlemek (aksiyon-bazlı kararla eklenir).
- `ClientApprovalRequest` veya `OfficeApprovalRequest` şema/kod değişikliği (bu ADR docs-only).

## Consequences

### Positive
- Tek tutarlı onay modeli; "nihai karar kurucu ortakta" ilkesi platform geneline yayılır.
- Audit (kim istedi/onayladı/reddetti) doğal kazanım; 4.7d-2 authz+audit boşluğu kapanır.
- Substrate REUSE → motor tekrar yazılmaz.

### Negative
- Her durum-değişikliği için onay → operasyonel friction (kurucu-ortak doğrudan-execute nüansı ve eşik kararlarıyla hafifletilir).
- Büyük, çok-fazlı backend programı; sıralama + engine core hardening şart.
- Mevcut çalışan kontrollerin (ClientOffset) modele alınması ayrı dikkatli tasarım ister.

### Neutral
- Bilgi girişi akışları değişmez (doğrudan kalır).
- Engine substrate zaten generic; ek model değişikliği gerektirmez.

## References
- P4 Approval Engine: `OfficeApprovalRequest` (schema), office-approval module, deferred executor (#592/#597/#604/#612/#618/#624/#627).
- `docs/governance/decision-log.md`, `docs/governance/architecture-index.md`, `docs/governance/product-backlog.md`.
- Client Intake 4.7d-2 design-gate (intel mutation authz/audit bulgusu).

## Revision History
| Date | Version | Change |
|---|---|---|
| 2026-06-29 | 1.0 | İlk karar (docs-only, design lock; implementation YOK). Universal Office Approval ilkesi sabitlendi. |
