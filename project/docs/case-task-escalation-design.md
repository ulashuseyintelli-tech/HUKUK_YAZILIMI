# Dosya Görevi Bildirim & Eskalasyon — Tasarım (Gate D / D-i)

> Durum: **TASARIM KİLİTLİ — KOD YOK.** Kararlar (K-D1..K-D5 + SLA) onaylandı (Ulaş, 2026-06-21). Gate'ler sırayla uygulanacak.
> Tarih: 2026-06-21 · Repo HEAD: `6c42aa8` · Üst tasarım: [[case-responsibility-model-design.md]]
> Karar veren: Ulaş · Hazırlayan: agent (kod düzeyinde census ile)

---

## 0. Özet

Dosyaya bağlı **otomatik** görevler (LEGAL_WORKFLOW, A5 ile artık `assigneeId =
Dosya Sorumlusu`) için **owner-first** bir bildirim + eskalasyon merdiveni:

```
Görev (assignee=Dosya Sorumlusu) → süre/SLA → Takım Lideri → Yönetici Avukat → Kurucu
```

Mevcut `OPERATIONAL_COMPLETENESS` motoruna **DOKUNULMAZ** (o, case-less bilgi-tamamlama
kuyruğu; ayrı kalır). Yeni motor **ayrı servis + ayrı cron + ayrı alanlar** ile yazılır;
dispatch altyapısı (SMTP/SMS, şablon yardımcıları) **yeniden kullanılır**.

---

## 1. Census — mevcut motor anatomisi

### 1.1 OperationalEscalationService (`modules/escalation/operational-escalation.service.ts`)
- `@Cron(EVERY_HOUR) scheduledRun → processEscalations()`.
- **Hedef sorgu:** `taskCategory='OPERATIONAL_COMPLETENESS'`, `status∈{PENDING,IN_PROGRESS}`,
  `escalationLevel != null` (service:82-97). **Case-less** görevler (clientId/debtorId).
- Kademe: `STAFF → MANAGER → FOUNDER` (saf mantık `escalation-logic.ts:computeEscalationUpdate`).
- `resolveRecipients(tier)` (service:220-258): **STAFF**→`StaffMember`(office.opStaffTypes) ·
  **MANAGER**→`Lawyer`(escalationManagerLawyerIds | rank=MANAGER) · **FOUNDER**→`Lawyer`
  (escalationFounderLawyerIds | role∈OWNER/PARTNER).
- `dispatch` → `sendTenantEmail` (per-tenant SMTP/nodemailer) + `sendTenantSms` (NetGSM/İleti Merkezi).
- **Retry-safety:** guard (`lastNotifiedLevel`) yalnız `SENT`'te ilerler; zaman çizelgesi
  (`escalationLevel`+`nextFollowUpAt`) her zaman kalıcı.
- K2 iz: `EscalationEvent` (append-only).

### 1.2 Yeniden kullanılabilir parçalar (motoru BOZMADAN)
| Parça | Konum | Kullanım |
|-------|-------|----------|
| `sendTenantEmail` / `sendTenantSms` | service (private) | **çıkarılıp** paylaşılacak (TenantNotifier) |
| `channelsForTier`, `normalizeTrPhone`, `addDays/addMonths` | escalation-logic.ts | doğrudan |
| `formatTrDateTime`, `formatRemaining`, `priorityTr` | service (export) | doğrudan |
| Office config: `escalationManagerLawyerIds`, `escalationFounderLawyerIds`, SMTP/SMS, `opEmailEnabled/opSmsEnabled` | schema:1685-1696 | MANAGER/FOUNDER + kanal |
| `EscalationEvent` modeli | schema:1529 | K2 iz (ortak veya ayrı) |
| State-machine **deseni** (compute→dispatch→record→update) | service | replike edilir |

### 1.3 Dosya-görevi manzarası (yeni motorun hedefi)
- **caseId'li + LEGAL_WORKFLOW** görevler (A5'in `assignee=Dosya Sorumlusu` yazdığı 5 creator):
  expense ×2 (Masraf Takibi/vade) + scheduler ×3 (İhbarname · Alacak Haczi · Tebligat İade).
- Bu görevler bugün **escalation tier taşımıyor** (yalnız bazıları `dueDate` set ediyor).
- `Task` zaten taşıyor: `assigneeId→User`, `caseId`, `dueDate`, `status`, `priority`,
  `escalationLevel/nextFollowUpAt/lastNotifiedLevel` (operasyonel motorun alanları).

---

## 2. Hedef mimari — ayrı, owner-first motor

**`CaseTaskEscalationService`** (yeni, `modules/escalation/` altında ayrı dosya):
- `@Cron(EVERY_HOUR)` (ayrı) → `processCaseTaskEscalations()`.
- **Hedef sorgu (operasyonel motordan DİSJOİNT):**
  `caseId != null`, `taskCategory='LEGAL_WORKFLOW'`, `status∈{PENDING,IN_PROGRESS}`,
  `assigneeId != null` (+ yeni `caseEscalationLevel` alanı / aday-init).
- **Owner-first ladder (L0 KİŞİ):**

```
L0 RESPONSIBLE  → task.assignee (Dosya Sorumlusu, User.email)          [YENİ: belirli kişi]
L1 TEAM_LEAD    → Office.escalationTeamLeadLawyerIds (Lawyer)          [YENİ rol-kuyruğu]
L2 MANAGER      → escalationManagerLawyerIds | rank=MANAGER            [mevcut çözüm reuse]
L3 FOUNDER      → escalationFounderLawyerIds | role∈OWNER/PARTNER (+SMS) [mevcut reuse]
```

- Dispatch: ortak `TenantNotifier.sendEmail/sendSms` (1.2'den çıkarılmış).
- İçerik: dosya-görevi şablonu (case fileNumber + görev başlığı + dueDate/kalan süre +
  deep-link `/cases/:id`), `formatRemaining`/`priorityTr` reuse.
- Retry-safety guard deseni birebir kopyalanır (yalnız SENT'te ilerle).

---

## 3. Tasarım kararları — KİLİTLİ (Ulaş, 2026-06-21)

**K-D1 ✅ AYRI alan + AYRI enum.** YENİ `enum CaseTaskTier {RESPONSIBLE, TEAM_LEAD, MANAGER,
FOUNDER}` + YENİ `Task.caseEscalationLevel/caseNextFollowUpAt/caseLastNotifiedLevel`. Mevcut
`escalationLevel`/`EscalationTier` **PAYLAŞILMAZ** → iki motor sıfır ortak yazılır-state.

**K-D2 ✅ Takım Lideri = YENİ `Office.escalationTeamLeadLawyerIds`** (Lawyer id dizisi; manager/founder
ile aynı desen). **Boşsa L1 ATLANIR → doğrudan L2 Yönetici Avukat (MANAGER).**

**K-D3 ✅ SLA = YENİ Office alanları** `caseTaskOwnerDays=2`, `caseTaskTeamLeadDays=2`,
`caseTaskManagerDays=3`; FOUNDER periyodik tekrar için `opRepeatMonths` reuse. Operasyonel motorla
aynı `computeEscalationUpdate` deseni, AYRI cfg.

**K-D4 ✅ KAPSAM = assignee'si olan TÜM caseId'li LEGAL_WORKFLOW görevler — MANUEL DAHİL.**
Yalnız-oto DEĞİL: dosyaya bağlı + atanmış her görev (auto creator VEYA `task.service` manuel CRUD)
aynı disipline tabi. Motor **lazy-init**: `caseEscalationLevel=null` + `assigneeId!=null` +
`caseId!=null` + `taskCategory='LEGAL_WORKFLOW'` görevini adopt edip L0 RESPONSIBLE'dan başlatır
(creator'lar yeniden ELLENMEZ).

**K-D5 ✅ Ortak `TenantNotifier` EXTRACTION (duplikasyon YOK).** `sendTenantEmail/Sms` + gerekli saf
helper'lar OperationalEscalationService'ten **davranış-koruyan** extraction; characterization test
"çıktı aynı" kanıtlar. İki motor da aynı `TenantNotifier`'ı çağırır.

**K-D6 — K2 iz (ayrı enum sonucu, D-G3'te netleşir):** AYRI `CaseTaskEscalationEvent` tablosu eğilimli
(K-D1 decoupling ile tutarlı); alternatif `EscalationEvent`'e `tierKind`+string level. D-G3 gate'inde sabitlenir.

---

## 4. Migration ihtiyacı (ADDITIVE; dev-applied, prod N/A — proje deseni)

Öneri setiyle:
- `enum CaseTaskTier` (yeni).
- `Task` += `caseEscalationLevel CaseTaskTier?`, `caseNextFollowUpAt DateTime?`, `caseLastNotifiedLevel CaseTaskTier?`.
- `Office` += `escalationTeamLeadLawyerIds String[]`, `caseTaskOwnerDays Int @default(2)`,
  `caseTaskTeamLeadDays Int @default(2)`, `caseTaskManagerDays Int @default(3)`.
- (K-D6'ya göre) EscalationEvent şeması veya yeni tablo.
- **Hepsi additive/nullable/defaultlu** → mevcut satır/motor etkilenmez.

---

## 5. "Mevcut motoru bozma" garantileri

1. **Ayrı servis + ayrı cron** — OperationalEscalationService'e dokunulmaz (extraction hariç, o da
   davranış-koruyan + characterization test).
2. **Disjoint hedef sorgu** — yeni motor `LEGAL_WORKFLOW`, eski motor `OPERATIONAL_COMPLETENESS`.
   Bir görev asla iki motorda işlenmez.
3. **Ayrı alanlar/enum (K-D1 öneri)** — sıfır ortak yazılır-state.
4. **Reuse yalnız saf/dispatch** — şablon helper'ları + SMTP/SMS davranışı değişmez.

---

## 6. Gate planı (onay sonrası; her biri ayrı küçük PR)

- **D-G0 — Şema/migration** (CaseTaskTier + Task/Office alanları). Additive; `prisma validate/generate`,
  dev-apply. Kod yok, davranış yok.
- **D-G1 — TenantNotifier extraction** (sendTenantEmail/Sms ortak servise; OperationalEscalationService
  onu çağırır). Characterization test: çıktı/limit aynı. Davranış DEĞİŞMEZ.
- **D-G2 — Saf state-machine** (`case-task-escalation-logic.ts`: RESPONSIBLE→TEAM_LEAD→MANAGER→FOUNDER,
  cfg'li). DB'siz, tam unit test. Kod ama runtime'a bağlı değil.
- **D-G3 — CaseTaskEscalationService** (cron + adopt/lazy-init + dispatch + EscalationEvent). Recipient
  resolution: L0 assignee(User), L1 teamLead, L2/L3 reuse. Flag-gated başlat (varsayılan KAPALI).
- **D-G4 — İçerik/şablon** (dosya-görevi maili: fileNumber + dueDate + kalan süre + `/cases/:id`).
- **D-G5 — Office ayar UI** (escalationTeamLeadLawyerIds + caseTask SLA günleri) — frontend.
- **D-G6 — Canlı doğrulama + flag açma kararı** (gerçek SMTP, owner-first sıra; prod açma ayrı ürün kararı).

---

## 7. Kararlar — KİLİTLİ (Ulaş, 2026-06-21)

Tümü onaylandı: **K-D1** ayrı alan+enum (paylaşım yok) · **K-D2** `escalationTeamLeadLawyerIds`
(boşsa L1 atla → Yönetici) · **K-D4** manuel DAHİL tüm caseId'li + atanmış LEGAL_WORKFLOW ·
**K-D5** `TenantNotifier` extraction · **SLA** 2/2/3 gün. Gate'ler (D-G0→D-G6) bu kararlarla uygulanır.

---

## 8. Non-goals
- ❌ OPERATIONAL_COMPLETENESS motorunu değiştirmek/birleştirmek.
- ❌ Case-less (müvekkil/borçlu) görevlere owner-first uygulamak (orada owner YOK).
- ❌ Manuel görev CRUD'a assignee dayatmak (A5 zaten yalnız auto'ya dokundu).
- ❌ Prod'da flag açmak (D-G6 sonrası ayrı ürün kararı).
