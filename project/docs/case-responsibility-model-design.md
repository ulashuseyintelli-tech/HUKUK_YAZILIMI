# Dosya Sorumluluğu & Ekip Modeli — Tasarım Kararı

> Durum: **KARARLAR KİLİTLİ — kod onay-bekliyor (gate-by-gate).**
> Tarih: 2026-06-21 · Repo HEAD (karar anı): `9c6a2db` · Branch: `main`
> Karar veren: Ulaş · Hazırlayan: agent (kod düzeyinde doğrulanmış bulgular)

---

## 0. Tek cümlelik özet

"Sorumlu" alanı **kaldırılacak bir alan değildir**; sistemin merkezindeki
**dosya sahipliği** kavramına dönüştürülmeli, **görünür** kılınmalı ve
**görev/bildirim motoruna bağlanmalıdır**. **Yeni rol tablosu yazılmaz** —
mevcut `CaseLawyer` + `CaseStaff` zaten ekip modelidir.

---

## 1. Problem: Aynı kavramın 3-4 ayrı temsili (PARÇALANMA)

Bugün "kim bu dosyadan sorumlu / kim çalışıyor" sorusu sistemde **4 kopuk
yerde** temsil edilebiliyor ve hepsi teorik olarak **farklı kişileri**
gösterebiliyor:

| # | Mekanizma | İşaret ettiği kimlik | Bugünkü durum |
|---|-----------|----------------------|----------------|
| 1 | `Case.sorumluPersonelId` | **User** (login hesabı) | Opsiyonel (yıldız kozmetik), liste filtresinde + personel raporunda var, **detayda görünmez**, göreve/bildirime **bağlı değil** |
| 2 | `CaseLawyer.isResponsible` | **Lawyer** (avukat profili) | Wizard "Avukatlar" yazıyor, "tam 1 sorumlu" kuralı var |
| 3 | `CaseStaff.roleOnCase` (UI'da SORUMLU) | **StaffMember** (personel profili) | Wizard "Personel" seçimi yazıyor |
| 4 | `Task.assigneeId` | **User** | Alan var; **eskalasyon motoru bunu hiç okumuyor** |

Hastalık az-modelleme değil; **fazla/parçalanmış modelleme**. Uzun vadede
kesin tutarsızlık üretir.

### Kanıt (kod düzeyi, dosya:satır)
- `Case.sorumluPersonelId → User`: `apps/api/prisma/schema.prisma:977-978`
- "ZORUNLU" yalanı: DTO `@IsOptional` `case.dto.ts:585-587`; ön-yüz
  validasyonunda alan **yok** `apps/web/.../hooks/useValidation.ts:32-133`
- Dropdown TÜM kullanıcıları (VIEWER dahil) çekiyor:
  `cases/new/page.tsx:1358` + `:400`; `user.service.ts:8-21` (rol filtresi yok)
- Detayda gösterilmiyor: `cases/[id]/page.tsx` (sorumluPersonel referansı yok)
- Ekip zaten var: `CaseLawyer` `schema.prisma:1851`; `CaseStaff` `schema.prisma:3056`
- Eskalasyon motoru sorumludan kopuk: `operational-escalation.service.ts:220-258`
  (alıcı = ofis rol-kuyruğu); contact-followup görevi `assigneeId` set etmiyor
  `client.service.ts:389-404`

---

## 2. Hedef model: 3 ayrı kavram (net ayrım)

### Kavram 1 — Dosya Sorumlusu (sahip / koordinatör)
- **TEK** kişi. `Case.sorumluPersonelId → User`.
- **Zorunlu** — dosya sahipsiz kalamaz.
- Dashboard'da, dosya listelerinde, **dosya detayında**, performans
  raporlarında görünür.
- Operasyonel görevlerin **varsayılan sahibi** ve eskalasyonda **ilk
  bildirilen** kişi.

### Kavram 2 — Dosya Ekibi (dosyada çalışanlar)
- **Mevcut yapı kullanılır, YENİ TABLO AÇILMAZ:**
  - `CaseLawyer` → Sorumlu Avukat / atanmış avukatlar (`role`, `isResponsible`,
    `casePermissions`, vekalet)
  - `CaseStaff` → Takip / Tahsilat / İstihbarat / Yazı-İşleri personeli
    (`roleOnCase`, yetkiler)
- Daha zengin "Dosya Ekibi" görünümü istenirse bu bir **read-model / UI
  birleşimi**dir; yeni yazma otoritesi değil.

### Kavram 3 — Görev Sorumlusu (tek bir işin sahibi)
- `Task.assigneeId → User`. Örn. "Mernis Araştırması → Zeynep".
- Dosya Sorumlusu'ndan **farklı** olabilir; varsayılanı odur (bkz. A5).

---

## 3. Kilitli kararlar

| Karar | İçerik | Sonuç |
|-------|--------|-------|
| **A1** | Etiket "Sorumlu" → **"Dosya Sorumlusu"** | ✅ Onaylı |
| **A2** | **Zorunlu**; varsayılan = **oturumu açan kullanıcı** (sonradan değiştirilebilir) | ✅ Onaylı |
| **A3** | Dosya **detay** ekranında göster (Dosya Sorumlusu + Dosya Ekibi kartı) | ✅ Onaylı |
| **A4** | Dropdown'u **sorumlu olabilecek** kullanıcılara filtrele (isActive, VIEWER hariç) | ✅ Onaylı |
| **A5** | Operasyonel görev üretilince **varsayılan `Task.assigneeId` = Dosya Sorumlusu** | ✅ Onaylı |
| **C**  | **Model-1**: `sorumluPersonel` = User (koordinatör). User/Lawyer/StaffMember birleşimi (Model-2) **AYRI PROJE — dokunulmaz** | ✅ Onaylı |
| **D**  | **D2**: önce Dosya Sorumlusu, süre geçince kademeli rol-kuyruğuna eskale | ✅ Onaylı |

---

## 4. D2 eskalasyon zinciri — mevcut motora oturtma

**İstenen akış:**

```
Görev oluştu
   ↓
Dosya Sorumlusu        ← YENİ kademe (L0): belirli KİŞİ
   ↓ (süre geçti)
Takım Lideri           = mevcut STAFF kademesi (ofis rol-kuyruğu, opStaffTypes)
   ↓ (opReminderDays)
Yönetici Avukat        = mevcut MANAGER kademesi
   ↓ (opFounderDays)
Kurucu                 = mevcut FOUNDER kademesi (+ SMS)
```

**Mevcut motor (doğrulandı):**
- `enum EscalationTier { STAFF, MANAGER, FOUNDER }` — `schema.prisma:2846`
- Ofis konfigi: `opStaffTypes` (default `[MUHASEBE, ADLI_KATIP, SEKRETER]`),
  `escalationManagerLawyerIds`, `escalationFounderLawyerIds`,
  `opReminderDays=3`, `opFounderDays=6`, `opRepeatMonths=3` —
  `schema.prisma:1685-1696`
- Saatlik cron + zaman-temelli ilerleme: `operational-escalation.service.ts`,
  `escalation-logic.ts`

**D2 değişikliği (tek additive enum + sınırlı dokunuş):**
1. `EscalationTier` += **`RESPONSIBLE`** (yeni başlangıç kademesi).
2. Operasyonel görev **RESPONSIBLE** kademesinden başlar (bugün STAFF'tan —
   gate D'de kod düzeyinde doğrulanacak).
3. `resolveRecipients(RESPONSIBLE)` → görevin `assigneeId`'sinin (A5 ile bu =
   Dosya Sorumlusu) **User.email**'i. *(User.email var: `schema.prisma:308`.)*
4. Yeni ofis konfigi `opResponsibleDays` (varsayılan öneri: 1-2 gün) → bu süre
   sonunda RESPONSIBLE → STAFF.
5. **Zarif fallback:** görevde assignee/owner **yoksa** RESPONSIBLE atlanır,
   doğrudan STAFF'tan başlar (eski sahipsiz dosyalar için).

> Not: "Takım Lideri" = mevcut STAFF rol-kuyruğu olarak eşlenir (enum
> değişmez). Ayrı tek-kişilik "Takım Lideri" rolü istenirse bu **ayrı bir
> genişletme**dir (ek enum + ofis konfigi); şimdilik kapsam dışı.

---

## 5. Gate-by-gate uygulama planı

Her gate **ayrı küçük PR**. Her gate: plan → onay → additive fix → unit +
canlı doğrulama → PR → merge. Önerilen sıra:

### Gate A1 — Etiket yeniden adlandırma (risk: yok)
- "Sorumlu" → "Dosya Sorumlusu": wizard, liste kolonu/filtresi, karşılaştırma
  modalı, özel rapor kolonu.
- **Dokunulan:** yalnız frontend metin. Şema/davranış değişmez.
- **Multitenant:** etkisi yok.

### Gate A4 — Dropdown filtresi (risk: düşük)
- Wizard "Dosya Sorumlusu" dropdown'u: `isActive=true` ve `role != VIEWER`
  kullanıcılar. **İstisna:** zaten atanmış mevcut sorumlu (artık pasif/viewer
  olsa bile) listede kalmalı (değeri kaybetme).
- **Karar:** client-side filtre (yüklü `users` üzerinde) — API değişmez.
- **Multitenant:** `/users` zaten `findByTenant` ile tenant-scoped.

### Gate A3 — Detay ekranı görünürlüğü (risk: düşük, salt-okuma)
- Dosya detayında **"Dosya Sorumlusu"** + **"Dosya Ekibi"** kartı.
- Dosya Ekibi = `CaseLawyer` (isResponsible/role) + `CaseStaff` (roleOnCase)
  **read-model birleşimi** (Karar B; yeni tablo yok).
- **Ön-koşul:** detay endpoint'i `sorumluPersonel` + `lawyers` + `staff`
  döndürüyor mu — gate başında doğrulanır; eksikse `include` eklenir (additive).
- **Multitenant:** mevcut tenant-scoped detay sorgusu korunur.

### Gate A2 — Zorunluluk + varsayılan (risk: orta)
- **Frontend:** wizard açılışında `sorumluPersonelId` = oturum açan kullanıcı
  (prefill); `useValidation`'a "boş olamaz" kuralı; yıldız artık gerçek.
- **Backend (güvence):** create path'te `sorumluPersonelId` **yoksa** →
  oluşturan kullanıcı (`req.user.id`) atanır. *(Reddetmek yerine varsayılan →
  "dosya sahipsiz kalamaz" garantisi; API'den de garanti.)*
- **Dokunulan:** `case.service.ts` create (~`:1155-1290`), `case.dto.ts`,
  `useValidation.ts`, wizard prefill. Mevcut tenant guard'ı (`:1155-1161`) korunur.
- **AÇIK ALT-KARAR (bloklamaz):** Eski **sahipsiz** dosyalar (sorumluPersonelId
  = null) ne olacak? — backfill ertelenir / ayrı karar (kime atanacağı ürün
  kararı; sessizce tahmin edilmez).
- **Multitenant:** oluşturan kullanıcı tanımı gereği aynı tenant.

### Gate A5 — Görev varsayılan sahibi (risk: orta)
- Operasyonel görev otomatik üretilince `Task.assigneeId` **varsayılan = Dosya
  Sorumlusu**.
- **Gate başı zorunlu adım (AGENTS.md):** TÜM `Task.create` çağrı-yerlerinin
  envanteri (contact-followup `client.service.ts:389`, borçlu istihbarat,
  adres, vb.). Hangileri operasyonel + sahipsiz üretiyor tespit edilir.
- **Multitenant:** assignee aynı tenant'taki User olmalı (case.tenantId ile).

### Gate D — D2 eskalasyon (risk: en yüksek; en son)
- Bölüm 4'teki RESPONSIBLE kademesi: enum + state machine (`escalation-logic.ts`)
  + `resolveRecipients` (User.email dalı) + `opResponsibleDays` konfigi +
  fallback.
- **Migration:** `EscalationTier` += RESPONSIBLE, Office += `opResponsibleDays`
  → **additive**, dev-applied; **prod N/A** (proje deseni).
- **A5'e bağımlı** (assignee dolu olmalı). En son yapılır.
- **AÇIK ALT-KARAR (bloklamaz):** RESPONSIBLE alıcısı `Task.assigneeId` mi
  (önerilen — motor tek alan okur, A5 ile = owner) yoksa doğrudan
  `Case.sorumluPersonelId` mi? Öneri: **assigneeId**.

---

## 6. Kapsam DIŞI (non-goals)

- ❌ Yeni `CaseAssignment`/rol tablosu — ekip zaten `CaseLawyer`+`CaseStaff`.
- ❌ Model-2 (User/Lawyer/StaffMember kimlik birleştirme) — ayrı proje.
- ❌ K1 kimlik köprüsünü zorunlu yapmak / prod'a almak.
- ❌ Mevcut review/intake sınırlarına dokunmak.

---

## 7. Doğrulama ilkesi

Her gate kod **ve** canlı doğrulanır (koddan bakıldı ≠ çalışıyor). Tenant
scope tüm yollarda korunur. Bayat bilgi spot-check edilir.
