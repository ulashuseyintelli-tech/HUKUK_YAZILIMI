# WP-4b — Permission Enforcement Decision / Policy

> **Durum:** Karar / tasarım dökümanı (docs-first). **Kod YOK · enforcement YOK · migration YOK · schema YOK · UI YOK ·
> davranış değişikliği YOK · permission check YOK.** Yalnız ürün kararını ve fazlı modeli kayda alır.
> **Bağlam:** WP-4a current-state bulgusuna ([`wp4a-permission-role-model-design.md`](./wp4a-permission-role-model-design.md))
> verilen ürün cevabıdır.
> **Ön sürüm:** origin/main `4dfc791`.

## Ana ilke (her şeyin üstünde)

> **Operasyonel yetki devredilebilir. Hukuki sıfat devredilemez.**

---

## 1. Decision summary

- **Trust-based flat model REDDEDİLDİ.** "Tenant'a girmiş herkes her şeyi yapar" kalıcı kabul değildir.
- **Permission tree / RBAC + fazlı, auditli enforcement KABUL EDİLDİ.** Enforcement bir anda açılmaz; Phase 0→3
  kademeli + auditli + güvenli migration ile ilerler.
- **Dekoratif izin alanları karara bağlandı:** `UserRole`, `LawyerRank`, `StaffMember` izinleri, `CaseStaff` izinleri,
  `CaseLawyer` izinleri artık "future authority" değil; **ya enforce edilecek ya da sonraki cleanup'ta düşürülecek.**
- **Karar:** enforce edilecek, ama **kademeli.**

## 2. Why trust-based flat model is rejected

- **Tenant-scoping tek başına yetersiz:** `JwtAuthGuard` + `tenantId` filtresi yalnız "kendi tenant'ının verisi"
  ayrımı yapar; tenant İÇİNDE yetki ayrımı YOK. Kimliği doğrulanmış herhangi bir kullanıcı her dosyada CRUD + atama
  yapabilir (WP-4a bulgusu).
- **Hukuki risk:** Hukuki sıfat (sorumlu avukat / sign-off) ile operasyonel işi ayırmamak, personelin hukuki sıfat
  taşıyormuş gibi görünmesine yol açar — kabul edilemez.
- **Dekoratif alanlar yanıltıcı:** saklanan ama enforce edilmeyen izinler, var-sanılan ama işlemeyen güvenlik hissi
  yaratır. Ya gerçek olacak ya da kalkacak.

## 3. Permission tree / RBAC accepted model

- **Capability ağacı** (yaprak = atomik yetki) + **scope** (OWN/ASSIGNED/TEAM/OFFICE/ALL) + **rol şablonları** (hazır
  capability profilleri) + **legal hard guards** (mutlak, ağacın üstünde).
- **CPE yeniden inşa edilmez; köprülenir:** yüksek-riskli aksiyonlar (APPROVE_EXPENSE, UYAP_SEND…) zaten CPE'de;
  permission tree onları capability fact'i ile besler, genel CRUD'a ince guard ekler.
- **Etkin yetki = roleTemplate(caps) ∘ granular override ∘ scope; legal hard guard her zaman önce.** Tek read-model.

## 4. User type vs permission vs legal responsibility (dört eksen)

| Eksen | Ne | Örnek | Devredilebilir mi? |
|---|---|---|---|
| **personType / professional status** | Mesleki kimlik | Avukat / Personel (StaffType) | Hayır (kimlik) |
| **roleTemplate** | Hazır yetki profili | "Ofis Yöneticisi" | Evet (atanır) |
| **granular permission** | Atomik yetki + scope | `cases.update@TEAM` | Evet (override) |
| **legal hard guard** | Hukuki sıfat kuralı | "Hukuki Sorumlu Avukat = avukat" | **HAYIR (mutlak)** |

roleTemplate/granular ne kadar geniş olursa olsun **legal hard guard'ı geçersiz kılamaz.**

## 5. Legal hard guards (mutlak; permission tree override edemez)

1. **Hukuki Sorumlu Avukat yalnız AVUKAT olabilir** (`CaseLawyer.isResponsible` → Lawyer).
2. **Personel Dosya Operasyon Sorumlusu OLABİLİR** (`Case.responsibleStaffId` — operasyonel sıfat meşru).
3. **Personel geniş operasyonel/admin yetki ALABİLİR** (görüntü/düzenle/atama/finans/ofis-yönetimi).
4. **Personel Hukuki Sorumlu Avukat OLAMAZ.**
5. **Personel hukuki review / sign-off YAPAMAZ.**
6. **Büro sahibi checkbox ile personele hukuki sıfat VEREMEZ.**
7. **Bu guard'lar permission tree'yi override EDEMEZ; permission tree de bunları override edemez.** Legal guard,
   permission katmanından ÖNCE ve ÜSTÜNDE değerlendirilir → ihlal `LEGAL_HARD_GUARD_DENIED`.

## 6. Permission tree (başlangıç önerisi)

| Capability | Anlam |
|---|---|
| `cases.view` | Dosya görüntüleme |
| `cases.create` | Dosya oluşturma |
| `cases.update` | Dosya düzenleme |
| `cases.delete` | Dosya silme/iptal |
| `cases.close` | Dosya kapatma |
| `cases.assignOperationOwner` | Dosya Operasyon Sorumlusu atama (avukat XOR personel) |
| `cases.changeLegalResponsibleLawyer` | Hukuki Sorumlu Avukat değiştirme — **legal-gated (avukat)** |
| `cases.viewResponsibilityHistory` | Sorumluluk geçmişi (WP-1d-4a) görüntüleme |
| `tasks.view` | Görev görüntüleme |
| `tasks.create` | Görev oluşturma |
| `tasks.assign` | Görev atama (Görev Atanan) |
| `tasks.completeManual` | Görevi manuel kapatma (Görevi Kapatan) |
| `tasks.reopen` | Kapanmış görevi yeniden açma |
| `staff.view` | Personel görüntüleme |
| `staff.manage` | Personel/atama yönetimi |
| `reports.view` | Rapor görüntüleme |
| `reports.export` | Rapor dışa aktarma |
| `finance.view` | Finans görüntüleme |
| `finance.manage` | Finans işlemleri |
| `office.manageUsers` | Kullanıcı yönetimi |
| `office.manageRoles` | Rol/şablon yönetimi |
| `office.manageSettings` | Ofis ayarları |
| `audit.view` | Audit kayıtları görüntüleme |

> Hukuki capability'ler (`cases.changeLegalResponsibleLawyer` + gelecekteki sign-off) verilse bile legal hard guard
> (avukat şartı) ile çift-kapılıdır.

## 7. Permission scopes

| Scope | Anlam |
|---|---|
| `OWN` | Yalnız kullanıcının kendi kaydı |
| `ASSIGNED` | Kullanıcının atandığı dosya/görev |
| `TEAM` | Kullanıcının ekibindeki dosyalar |
| `OFFICE` | Tüm ofis/tenant kayıtları |
| `ALL` | Sınırsız (sistem istisnası; normalde kullanılmaz) |

Etkin yetki = `capability @ scope` (ör. `cases.update@ASSIGNED`).

## 8. Role templates

| Şablon | personType | Özet profil |
|---|---|---|
| **Solo Avukat** | Avukat | Tümü `@OFFICE`/`@OWN`; tek kişi; hukuki+operasyonel+görev kendinde |
| **Büro Sahibi Avukat** | Avukat | Tüm capability `@OFFICE` + `office.*` + hukuki (legal-gated) |
| **Avukat** | Avukat | `cases.*@ASSIGNED/TEAM`, `tasks.*`, `finance.view`, hukuki capability'ler (legal-gated) |
| **Ofis Yöneticisi** | Personel | Geniş operasyonel + `office.manageUsers/Settings`, `staff.manage`, `finance.manage@OFFICE` — **hukuki YOK** |
| **Takip Personeli** | Personel | `cases.view/update@ASSIGNED`, `tasks.*`, `cases.assignOperationOwner`; hukuki YOK |
| **Muhasebe** | Personel | `finance.view/manage`, `reports.view`, `cases.view`; yazma dar |
| **Asistan** | Personel | `cases.view@ASSIGNED`, `tasks.view/create`; dar yazma |
| **Salt Okuma** | Avukat/Personel | `*.view` + `reports.view`; yazma yok |

> Şablonlar başlangıç; granular override mümkün (`ROLE_TEMPLATE_OVERRIDDEN`). Hiçbir şablon personType veya legal
> hard guard'ı değiştiremez.

## 9. Solo lawyer / no staff scenario

- Tek avukat, personelsiz büro **desteklenir** (zorunlu personel YOK).
- Aynı avukat aynı anda **Hukuki Sorumlu Avukat + Dosya Operasyon Sorumlusu + Görev Atanan** olabilir.
- "Solo Avukat" şablonu tüm operasyonel + hukuki capability'leri tek kişide toplar; avukat olduğu için legal guard
  sürtünme yaratmaz. Permission tree tek-kişi senaryosunda engel çıkarmaz.

## 10. Trusted office manager scenario

- Büro sahibi, güvendiği bir **personele** çok geniş operasyonel/admin yetki verebilir (Ofis Yöneticisi + override).
- **Bu yetkiler hukuki sıfat VERMEZ.** Personel Hukuki Sorumlu Avukat olamaz, sign-off yapamaz.
- Yetki verme anında UI uyarısı (gelecek faz):
  > "Bu kullanıcıya geniş operasyonel yetki veriyorsunuz; bu Hukuki Sorumlu Avukat sıfatı vermez."

## 11. Enforcement phases

| Faz | Ne | Davranış | Audit |
|---|---|---|---|
| **Phase 0 — Inventory only** | endpoint/permission haritası | **değişmez** | — |
| **Phase 1 — Diagnostics** | "Bu işlem ileride permission gerektirecek" raporu | **block yok** | (rapor) |
| **Phase 2 — Warn-only** | capability eksikse geçer ama işaretlenir | **durdurmaz** | `PERMISSION_WOULD_DENY` |
| **Phase 3 — Hard enforcement** | capability eksikse 403 | **durur** | `PERMISSION_DENIED` |

**Legal hard guards fazlardan bağımsız:** warn aşaması beklemez; hukuki sıfat gerektiren işlemlerde **en baştan sert**
→ `LEGAL_HARD_GUARD_DENIED`.

## 12. Audit events

| Event | Ne zaman |
|---|---|
| `USER_PERMISSION_CHANGED` | Granular permission değişti |
| `ROLE_TEMPLATE_ASSIGNED` | Kullanıcıya şablon atandı |
| `ROLE_TEMPLATE_OVERRIDDEN` | Şablon üstüne override yapıldı |
| `PERMISSION_WOULD_DENY` | Phase 2 warn: enforce edilseydi reddedilecekti |
| `PERMISSION_DENIED` | Phase 3 hard: 403 |
| `LEGAL_HARD_GUARD_DENIED` | Hukuki sıfat guard'ı reddetti (her fazda) |

> Tümü mevcut `AuditLog` tek-otorite akışına yazılır (yeni audit tablosu YOK).

## 13. Migration / default preset strategy

- **Tenant owner / ilk avukat → full access** (Büro Sahibi Avukat).
- **Solo lawyer default çalışır** (tek kişi engellenmez).
- **Mevcut kullanıcılar current behavior ile başlar** (enforce modu açılana kadar geniş/açık).
- **Diagnostics (Phase 1) çıkmadan hard enforcement YOK.**
- **Enforce açılmadan önce etkilenecek işlem sayısı raporlanır** (sürpriz kilitlenme yok).

## 14. Non-goals

- Enforcement / code / permission check YOK.
- Schema / migration YOK.
- UI permission tree YOK.
- Mevcut davranış değişikliği YOK.
- Staff capability matrix · legal review/sign-off · temporal UI · timeline backend · balance/shadow-display YOK.

## 15. Next gated implementation plan

- **WP-4c — Phase 0: enforcement inventory/audit (salt-okuma):** permission alanı ↔ endpoint ↔ capability haritası;
  hangi endpoint hangi capability'ye karşılık gelir, nerede enforce edilmiyor. **Kod yok / davranış yok.**
- **WP-4d — Phase 1: diagnostics endpoint/report** (block yok).
- **WP-4e — Phase 2: warn-only guard** (`PERMISSION_WOULD_DENY`).
- **WP-4f — Phase 3: hard enforcement** (`PERMISSION_DENIED`) + legal hard guards (gün-1 sert).
- **WP-4g — dekoratif alan cleanup** (enforce edilmeyecekleri düşür; legacy izin modellerini birleştir).
- Her faz ayrı, onaya-tabi gate; her biri kendi merge-koşullarıyla.
- **Timeline (WP-1d-4c responsibility-history):** backend-gated kalır; WP-4 permission enforcement önceliklidir.
