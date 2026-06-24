# WP-4b-0 — Permission Enforcement Policy Decision

> **Durum:** Karar / tasarım dökümanı (docs-first). **Kod YOK · enforcement YOK · migration YOK · UI YOK · davranış
> değişikliği YOK.** Yalnız politika kararını ve fazlı modeli kayda alır.
> **Bağlam:** WP-4a current-state bulgusuna ([`wp4a-permission-role-model-design.md`](./wp4a-permission-role-model-design.md))
> verilen ürün cevabıdır.
> **Ön sürüm:** origin/main `4dfc791`.

## Ana ilke (her şeyin üstünde)

> **Operasyonel yetki devredilebilir. Hukuki sıfat devredilemez.**

Operasyonel yetkiler (dosya görüntüleme/düzenleme, görev atama, finans yönetimi, hatta dosya operasyon sorumluluğu)
bir personele genişçe verilebilir. **Hukuki sıfat** (Hukuki Sorumlu Avukat, hukuki review/sign-off) **yalnız avukata**
aittir ve hiçbir yetki-checkbox'ı ile personele verilemez — büro sahibi dahi veremez.

---

## 1. Decision summary

- **Trust-based flat model REDDEDİLDİ.** "Tenant'a girmiş herkes her şeyi yapar" modeli kalıcı kabul değildir.
- **Permission tree / RBAC + fazlı enforcement KABUL EDİLDİ.** Yetki ağacı tanımlanır; enforcement kademeli (Phase 0→3)
  ve auditli açılır — bir anda sert kapı YOK.
- **Mevcut "dekoratif" izin alanları yeniden sınıflandırıldı:** `UserRole`, `LawyerRank`, `StaffMember` izinleri,
  `CaseStaff` izinleri, `CaseLawyer.casePermissions` artık "gelecekte belki" (future authority) DEĞİL; **karara
  bağlanmış bir enforcement backlog'u**dur. Sonuç: bu alanlar ya enforce edilecek ya da modelden düşürülecek —
  saklanan-ama-anlamsız kalmayacak.
- **Karar:** enforce edilecek, ama **kademeli + auditli** (Phase 0 envanter → Phase 1 diagnostics → Phase 2 warn →
  Phase 3 hard).

---

## 2. User type vs permission vs legal responsibility (dört ayrı eksen)

Bu eksenler birbirine KARIŞTIRILMAZ:

| Eksen | Ne | Örnek | Devredilebilir mi? |
|---|---|---|---|
| **personType / professional status** | Kişinin mesleki kimliği | Avukat / Personel (StaffType) | Hayır (kimlik) |
| **roleTemplate** | Hazır yetki profili | "Ofis Yöneticisi", "Takip Personeli" | Evet (atanır/değiştirilir) |
| **granular permissions** | Atomik yetki (+scope) | `cases.update@TEAM` | Evet (override edilir) |
| **legal hard guard** | Hukuki sıfat kuralı | "Hukuki Sorumlu Avukat = avukat" | **HAYIR (mutlak)** |

Kritik: roleTemplate ve granular permission ne kadar geniş olursa olsun, **legal hard guard'ları geçersiz kılamaz.**
Bir personele "Büro Sahibi" şablonu + tüm operasyonel capability verilse bile hukuki sıfat alamaz.

---

## 3. Hard legal guards (mutlak; checkbox ile aşılamaz)

1. **Hukuki Sorumlu Avukat yalnız AVUKAT olabilir.** (`CaseLawyer.isResponsible` yalnız Lawyer'a bağlanır.)
2. **Personel, Dosya Operasyon Sorumlusu OLABİLİR.** (`Case.responsibleStaffId` meşru — operasyonel sıfat.)
3. **Personel operasyonel FULL access alabilir** (görüntü/düzenle/atama/finans) — operasyonel yetki devredilebilir.
4. **Personel Hukuki Sorumlu Avukat OLAMAZ.** (Operasyonel full access ≠ hukuki sıfat.)
5. **Hukuki review / sign-off yalnız AVUKAT.** (`cases.changeLegalResponsibleLawyer`, hukuki onay → avukat-gated.)
6. **Büro sahibi bile checkbox ile personele hukuki sıfat VEREMEZ.** Legal hard guard, role/permission katmanının
   ÜSTÜNDEDİR; en yüksek yetkili kullanıcı dahi bypass edemez. İhlal → `LEGAL_HARD_GUARD_DENIED`.

> Bu guard'lar permission tree'den BAĞIMSIZ ve ondan ÖNCE değerlendirilir. Permission "izin verse" bile legal guard
> reddeder.

---

## 4. Permission tree model (önerilen capability ağacı)

| Capability | Anlam |
|---|---|
| `cases.view` | Dosya görüntüleme |
| `cases.create` | Dosya oluşturma |
| `cases.update` | Dosya düzenleme |
| `cases.delete` | Dosya silme/iptal |
| `cases.close` | Dosya kapatma |
| `cases.assignOperationOwner` | Dosya Operasyon Sorumlusu atama (avukat XOR personel) |
| `cases.changeLegalResponsibleLawyer` | Hukuki Sorumlu Avukat değiştirme — **legal-gated (avukat)** |
| `cases.viewResponsibilityHistory` | Sorumluluk geçmişi (WP-1d-4a panel) görüntüleme |
| `tasks.view` | Görev görüntüleme |
| `tasks.create` | Görev oluşturma |
| `tasks.assign` | Görev atama (Görev Atanan) |
| `tasks.completeManual` | Görevi manuel kapatma (Görevi Kapatan) |
| `staff.view` | Personel görüntüleme |
| `staff.manage` | Personel/atama yönetimi |
| `reports.view` | Rapor görüntüleme |
| `reports.export` | Rapor dışa aktarma |
| `finance.view` | Finans görüntüleme |
| `finance.manage` | Finans işlemleri (tahsilat/masraf vb.) |
| `office.manageUsers` | Kullanıcı yönetimi |
| `office.manageRoles` | Rol/şablon yönetimi |
| `office.manageSettings` | Ofis ayarları |
| `audit.view` | Audit/denetim kayıtlarını görüntüleme |

> Not: `cases.changeLegalResponsibleLawyer` ve hukuki sign-off capability'leri, verilse bile **legal hard guard**
> (avukat şartı) ile çift-kapılıdır.

---

## 5. Permission scopes (her capability bir scope ile sınırlanır)

| Scope | Anlam |
|---|---|
| `OWN` | Yalnız kullanıcının kendi oluşturduğu/sahibi olduğu kayıt |
| `ASSIGNED` | Kullanıcının atandığı dosya/görev (CaseLawyer/CaseStaff/assignee) |
| `TEAM` | Kullanıcının ekibindeki dosyalar (ofis-içi alt grup) |
| `OFFICE` | Tüm ofis/tenant kayıtları |
| `ALL` | Sınırsız (sistem/operasyonel istisna; normalde kullanılmaz) |

Etkin yetki = `capability @ scope`. Örn. Takip Personeli `cases.update@ASSIGNED` (atandığı dosyaları düzenler),
Büro Sahibi `cases.update@OFFICE`.

---

## 6. Role templates (hazır profiller)

| Şablon | personType | Tipik capability profili (özet) |
|---|---|---|
| **Solo Avukat** | Avukat | Her şey `@OFFICE`/`@OWN`; tek kişi; hukuki + operasyonel + görev hepsi kendinde |
| **Büro Sahibi Avukat** | Avukat | Tüm capability `@OFFICE` + `office.*` + `cases.changeLegalResponsibleLawyer` (legal-gated) |
| **Avukat** | Avukat | `cases.*@ASSIGNED/TEAM`, `tasks.*`, `finance.view`, hukuki capability'ler (legal-gated) |
| **Ofis Yöneticisi** | Personel | Geniş operasyonel + `office.manageUsers/Settings`, `staff.manage`, `finance.manage@OFFICE` — **ama hukuki capability YOK** |
| **Takip Personeli** | Personel | `cases.view/update@ASSIGNED`, `tasks.*`, `cases.assignOperationOwner` (operasyonel); hukuki YOK |
| **Muhasebe** | Personel | `finance.view/manage`, `reports.view`, `cases.view`; düzenleme/atama dar |
| **Asistan** | Personel | `cases.view@ASSIGNED`, `tasks.view/create`, dar yazma |
| **Salt Okuma** | Avukat/Personel | `*.view` + `reports.view`; hiçbir yazma yok |

> Şablonlar başlangıç noktasıdır; granular override mümkün (`ROLE_TEMPLATE_OVERRIDDEN` audit'lenir). Hiçbir şablon
> personType'ı veya legal hard guard'ı değiştiremez.

---

## 7. Solo lawyer scenario (tek-kişi büro)

- Tek avukat, personelsiz büro **desteklenir** (zorunlu personel YOK).
- Aynı avukat aynı anda **Hukuki Sorumlu Avukat + Dosya Operasyon Sorumlusu + Görev Atanan** olabilir — çakışma değil.
- "Solo Avukat" şablonu tüm operasyonel + hukuki capability'leri tek kişide toplar; legal guard'lar zaten avukat
  olduğu için sorun çıkarmaz.
- Permission tree, tek-kişi senaryosunda gereksiz sürtünme yaratmaz (her şey `@OFFICE`/`@OWN`).

---

## 8. Trusted office manager scenario (güvenilen personel)

- Büro sahibi, güvendiği bir **personele** çok geniş operasyonel/admin yetki verebilir (Ofis Yöneticisi şablonu +
  override): kullanıcı yönetimi, ayar, tüm dosyalarda operasyonel işlem, finans.
- **Bu yetkiler hukuki sıfat VERMEZ.** Personel "Ofis Yöneticisi" olsa bile Hukuki Sorumlu Avukat olamaz, hukuki
  sign-off yapamaz.
- Yetki verme anında UI **uyarı** gösterir (gelecek faz):
  > "Bu kullanıcıya geniş operasyonel yetki veriyorsunuz; bu Hukuki Sorumlu Avukat sıfatı vermez."
- Bu, "operasyonel devredilebilir / hukuki devredilemez" ilkesinin pratiğe yansımasıdır.

---

## 9. Enforcement phases (kademeli + auditli)

| Faz | Ne yapar | Davranış | Audit |
|---|---|---|---|
| **Phase 0 — Inventory/audit** | Mevcut permission alanlarının nerede kullanıldığı/kullanılmadığı listelenir | **Hiçbir davranış değişmez** | — |
| **Phase 1 — Read-only diagnostics** | Diagnostics endpoint/report: "Bu işlem ileride permission gerektirecek" | **Block YOK** | (rapor) |
| **Phase 2 — Warn-only** | Warn-only guard: capability eksikse işlem GEÇER ama işaretlenir | **Block YOK** | `PERMISSION_WOULD_DENY` |
| **Phase 3 — Hard enforcement** | Capability eksikse 403 | **Hard deny** | `PERMISSION_DENIED` |

> Legal hard guard'lar (bölüm 3) bu fazlardan BAĞIMSIZ olarak EN BAŞTAN serttir (warn aşaması yok) — hukuki sıfat
> ihlali asla "uyarı" ile geçmez → `LEGAL_HARD_GUARD_DENIED`. (Bu, fazlı yumuşaklığın tek istisnasıdır; ayrı kararla
> netleştirilecek ama varsayılan: hukuki guard gün-1 sert.)

---

## 10. Audit events

| Event | Ne zaman |
|---|---|
| `USER_PERMISSION_CHANGED` | Bir kullanıcının granular permission'ı değiştirildiğinde |
| `ROLE_TEMPLATE_ASSIGNED` | Kullanıcıya rol şablonu atandığında |
| `ROLE_TEMPLATE_OVERRIDDEN` | Şablon üstüne granular override yapıldığında |
| `PERMISSION_WOULD_DENY` | Phase 2 warn: enforce edilseydi reddedilecekti |
| `PERMISSION_DENIED` | Phase 3 hard: 403 verildi |
| `LEGAL_HARD_GUARD_DENIED` | Hukuki sıfat guard'ı reddetti (her fazda) |

> Tümü mevcut `AuditLog` tek-otorite akışına yazılır (yeni audit tablosu YOK); WP-1 audit deseniyle hizalı.

---

## 11. Migration / default preset stratejisi

- **Güvenli varsayılanlar:** mevcut kullanıcılar enforcement açılınca KİLİTLENMEZ.
- **Tenant owner / ilk avukat → full access** (Büro Sahibi Avukat şablonu).
- **Mevcut tenant kullanıcıları:** başlangıçta **current behavior korunur** (geniş/açık), enforcement modu açılana kadar.
- **Enforce modu açılmadan ÖNCE diagnostics (Phase 1) çalışır** → hangi kullanıcının hangi işlemde takılacağı önceden
  görülür; sürpriz kilitlenme yok.
- Preset atama + override `ROLE_TEMPLATE_ASSIGNED`/`OVERRIDDEN` ile audit'lenir.

---

## 12. Non-goals (bu PR'da KESİNLİKLE yok)

- Code enforcement / guard implementasyonu.
- Migration / schema değişikliği.
- UI permission tree ekranı.
- Mevcut davranış değişikliği (hiçbir endpoint kapanmaz/açılmaz).
- Hukuki review / sign-off implementasyonu.
- Staff capability matrix implementasyonu.
- Temporal UI (WP-1d) / Balance-shadow-display.

---

## Sonraki gate (WP-4b-0 merge edilmeden başlanmaz)

- **WP-4c — Phase 0: enforcement inventory/audit** (salt-okuma): mevcut permission alanlarının call-site haritası;
  hangi endpoint hangi capability'ye karşılık gelir; nerede enforce edilmiyor. **Kod yok / davranış yok.**
- Timeline (WP-1d-4c responsibility-history endpoint) ve "backend reconstruction constraint" gevşetmesi DAHA SONRA;
  şu an WP-4 permission enforcement daha öncelikli.
