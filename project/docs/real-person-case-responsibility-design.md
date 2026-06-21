# Dosya Sorumlusu = Gerçek Kişi (Model-2) — Tasarım Kararı

> Durum: **KARARLAR KİLİTLİ — kod onay-bekliyor (gate-by-gate).** İlk iş M2-G0 (dedup forensic, kodsuz).
> Tarih: 2026-06-21 · Repo HEAD (karar anı): `d709177` · Branch: `main`
> Karar veren: Ulaş · Hazırlayan: agent (kod + canlı DB düzeyinde doğrulanmış bulgular)
> Önceki karar (Model-1): [`case-responsibility-model-design.md`](./case-responsibility-model-design.md)

---

## 0. Tek cümlelik özet

Dosya Sorumlusu artık bir **login hesabına (`User`)** değil, büronun **gerçek
kişisine** (`Lawyer` veya `StaffMember`) bağlanır. `User` sistemde **eylem yapan
teknik aktör** olarak kalır; sorumluluk/hesap-verebilirlik ise gerçek kişiye taşınır.
Bu, Model-1'de (`Case.sorumluPersonelId → User`) bilinçli ertelenen kimlik
ayrımının uygulanmasıdır.

---

## 1. Problem: Picker login hesabı listeliyor, gerçek kişiyi değil

Model-1'de `Case.sorumluPersonelId → User`. "Dosya Sorumlusu" dropdown'ı bu yüzden
**yalnızca `User` (login hesabı)** listeler. Büro operasyonunda ise sorumlu kişi
bir **avukat** (`Lawyer`) veya **personeldir** (`StaffMember`) — ve bunların çoğunun
login hesabı yoktur.

### Kanıt (canlı DB, admin tenant `cmm61v99600007a6smfkarha9`, 2026-06-21)

| Tablo | Kayıt | Picker'da? | K1 köprüsü (`userId`) |
|-------|-------|-----------|------------------------|
| `User` | `Admin Kullanıcı` (ADMIN), `Test Kullanıcı` (USER) — **seed/demo** | **EVET** (tek 2 kayıt) | — |
| `Lawyer` | 9 kayıt: `ULAŞ HÜSEYİN TELLİ`, `FATMA ULUCA TELLİ`, `Şakir Fettahoğlu`, `EGE DURUSOY`… | **HAYIR** | **hepsi NULL** |
| `StaffMember` | 10 kayıt: `Fatih Engin` (MUHASEBE), `Büşra Atmaca` (SEKRETER), `Aysu Aktay` (STAJYER)… | **HAYIR** | **hepsi NULL** |

- Dropdown render: `cases/new/page.tsx:1368` → `{user.name} {user.surname}`. Yani
  zaten **kişi-adı** alanını gösteriyor; ama tek `User`'lar seed olduğu için
  ekranda "Admin Kullanıcı" / "Test Kullanıcı" görünüyor (rol değil, seed isim).
- **K1 köprüsü %0 dolu:** hiçbir `Lawyer`/`StaffMember` bir `User`'a bağlı değil
  → gerçek kişiler picker'da **yapısal olarak görünemez**.
- Sonuç: bu bir **etiket bug'ı değil**; Model-1'in (User-bağlı sahip) doğal sonucu.
  Etiketi düzeltsen bile `Av. Ulaş Hüseyin Telli` seçilemez — çünkü bir `User` değil.

---

## 2. Karar: Dosya Sorumlusu = gerçek kişi

İki kavram Model-1'de `User`'da birleşmişti; Model-2 ayırır:

| Kavram | Bağlandığı | Login gerekir mi? | İşlevi |
|--------|------------|-------------------|--------|
| **Sorumluluk / hesap-verebilirlik** ("bu dosyadan kim sorumlu") | **gerçek kişi** (`Lawyer`/`StaffMember`) | **HAYIR** | raporlama, eskalasyon hedefi, dosya sahibi |
| **Sistemde eylem** (görev yapma, izinler) | **`User`** (login) | **EVET** | görev üstlenme, sistemde işlem |

---

## 3. Referans modeli — iki nullable FK (`exactly-one`)

```prisma
model Case {
  // ... mevcut ...
  responsibleLawyerId String?
  responsibleLawyer   Lawyer?      @relation("CaseResponsibleLawyer", fields: [responsibleLawyerId], references: [id])
  responsibleStaffId  String?
  responsibleStaff    StaffMember? @relation("CaseResponsibleStaff",  fields: [responsibleStaffId],  references: [id])
}
```

**Kural: `exactly-one set`** — `responsibleLawyerId` ve `responsibleStaffId`'den
**tam biri** dolu olur (ikisi birden NULL = sahipsiz/legacy; ikisi birden dolu =
geçersiz, uygulama + tercihen DB CHECK ile engellenir).

### Neden iki nullable FK (Option A)?
- **Gerçek FK bütünlüğü** (referential integrity) — Prisma relation temiz.
- Polymorphic `(type, id)` string/id çöpüne düşmeyiz (FK constraint olmaz, bütünlük
  uygulama-katmanında kalır = kırılgan).
- `OfficeMember` gibi büyük birleşik-entity refactor'a **şimdi gerek yok**.

### Reddedilen alternatifler
- **Polymorphic (`responsiblePersonType` + `responsiblePersonId`):** FK yok, kırılgan. **RED.**
- **Birleşik `OfficeMember`/Personel üst-tipi:** en temiz uzun-vade ama en büyük iş
  (yeni tablo + backfill + her yerde `Lawyer`/`StaffMember` dokunuşu). Bu **Party
  değildir** — Party dış-taraf kimliğidir (Client/Debtor/ThirdParty), personel ayrıdır
  (bkz. `party-registry-design-review.md`). **ŞİMDİ RED** (ileride değerlendirilebilir).

---

## 4. Task.assignee kuplajı — dual-path

A5 kararı `Task.assigneeId = case.sorumluPersonelId` yazıyordu; `Task.assignee → User`.
Sahip artık gerçek kişi (çoğu zaman login yok) olduğundan, bir `Lawyer.id`
doğrudan User-FK'ye konamaz. Çözüm **çift yol**:

```text
owner'ın bağlı User'ı VAR (K1 köprüsü)  → Task.assigneeId = userId
owner'ın bağlı User'ı YOK               → Task.assigneeId = null
                                          bildirim/eskalasyon kişinin
                                          email / mobilePhone'una gider
```

Bu daha gerçekçidir: **her büro çalışanının login hesabı olmak zorunda değildir.**

---

## 5. `sorumluPersonelId` — geçişte KALIR

- `Case.sorumluPersonelId → User?` **kaldırılmaz**; çift-alan geçiş dönemi.
- Gerekçe: mevcut veri + login-tabanlı eylem + 118 referans (12 src dosya) tek
  seferde kırılmaz.
- Mevcut User-bağlı sahipler person-FK'ye **otomatik backfill EDİLMEZ:** K1 köprüsü
  %0 dolu, güvenilir `User → Lawyer/Staff` eşleşmesi yok → **tahminle eşleme YASAK**
  (sahipsiz-dosya kararıyla aynı ilke).
- Cutover (person-FK kanonik, `sorumluPersonelId` deprecation) **ayrı/ileride karar**
  (M2-G6).

---

## 6. `User` = teknik aktör olarak kalır

`User` modeli kaldırılmaz/küçültülmez. Login, izinler, `Task.assigneeId`,
`Task.completedByUserId`, audit aktörü — hepsi `User` üzerinden devam eder. Model-2
yalnızca **sahiplik** referansını gerçek kişiye taşır.

---

## 7. Mimariyi destekleyen kritik bulgu

Model-2 yeni bir bildirim mekanizması icat etmez; **mevcut deseni genişletir**:

- `Lawyer` ve `StaffMember` **zaten** `email`, `phone`, `mobilePhone`
  (*"SMS eskalasyonu bu alana gider"* — schema comment), `whatsappPhone` taşıyor.
- **Operasyonel** eskalasyon motoru zaten gerçek-kişi tabanlı:
  `Office.opStaffTypes → StaffMember.email`, `…FounderLawyerIds → Lawyer.email`.
- Yalnız **owner-first** motor (D hattı) `User`'a bağlı (`Task.assignee → User.email`).
- → Model-2, owner-first çözümü operasyonel motorla **aynı hizaya** getirir.

---

## 8. Ön-koşul: M2-G0 dedup (zorunlu, kodsuz)

Picker'a gerçek kişileri koymadan önce `Lawyer`/`StaffMember` verisi temizlenmeli.
Canlı DB'de (admin tenant) **8 adet "ulaş hüseyin telli" varyantı** + QA/test
kayıtları var. Kirli veri → kullanıcı 8 aynı isimden seçer.

**M2-G0 çıktısı (kod yok):**
1. Duplicate kişi kümeleri (normalize-isim bazlı).
2. Canonical kayıt önerisi (her küme için tutulacak kayıt).
3. Merge riskleri (hangi dup'a `CaseLawyer`/`CaseStaff`/`Task`/`Case` FK işaret ediyor
   → silinemez, repoint gerekir).
4. QA/test vs gerçek kayıt sınıflandırması.
5. Picker'a girebilecek aktif `Lawyer`/`StaffMember` listesi.

---

## 9. Etki alanı (blast radius)

`sorumluPersonelId`: ~118 referans / 12 src dosya (+ dist artefaktları).

```text
api/src: case.{controller,service,dto} · case __tests__ (3) ·
         expense-notification.service (A5) · scheduler.service (A5) · report.{controller,service}
web/src: cases/new/page · cases/[id]/page · reports/page · hooks/useValidation · lib/bulk-assign (+test)
```

Hepsi **additive** person-FK eklenince güncellenir; gate-by-gate.

---

## 10. Gate planı (her biri ayrı PR; flag/cutover ayrı)

| Gate | İçerik | Kod? | Migration? |
|------|--------|------|-----------|
| **M2-G0** | Dedup forensic + plan (duplicate kümeler, canonical, risk, QA/gerçek, picker-uygunluk) | **HAYIR** | hayır |
| **M2-G1** | Şema additive: `responsibleLawyerId`/`responsibleStaffId` nullable FK + relations; `sorumluPersonelId` durur | evet | additive |
| **M2-G2** | Birleşik kişi-listesi kaynağı (backend GET + select; aktif + deduped) | evet | hayır |
| **M2-G3** | Wizard + detay picker → gerçek kişiler, title'lı ("Av. …", "Sekreter …"); `exactly-one` validasyon | evet | hayır |
| **M2-G4** | owner→contact çözümü: escalation + A5 assignee **dual-path** | evet | hayır |
| **M2-G5** | Report + liste filtre güncelle (person bazlı) | evet | hayır |
| **M2-G6** | *(ileride, ayrı karar)* `sorumluPersonelId` deprecation / cutover | — | — |

---

## 11. Ertelenen / açık (bloklamaz)

- M2-G6 cutover (person-FK kanonik) = ayrı karar, mevcut veri + Av. sign-off.
- `exactly-one` DB-CHECK constraint mi yoksa yalnız uygulama-katmanı mı (M2-G1'de netleşir).
- Title üretimi: `Lawyer.title` var; `StaffMember` için `staffType → etiket` haritası (M2-G3).
- K1 köprüsünü (User ↔ gerçek kişi) elle doldurma akışı = ayrı UX (zorunlu değil).

---

## 12. Kilitli kararlar özeti

```text
- Dosya Sorumlusu = gerçek kişi (Lawyer/StaffMember)
- Reference = responsibleLawyerId / responsibleStaffId
- exactly-one rule
- sorumluPersonelId transition için kalır (otomatik backfill YOK)
- Task.assignee dual-path (linked User → userId; yoksa null + person email/phone)
- User login technical actor olarak kalır
- OfficeMember YOK
- polymorphic YOK
- dedup (M2-G0) zorunlu ön-koşul, picker ondan sonra
```

---

> İlgili: [`case-responsibility-model-design.md`](./case-responsibility-model-design.md) (Model-1),
> [`case-task-escalation-design.md`](./case-task-escalation-design.md) (owner-first eskalasyon, D hattı),
> [`sahipsiz-dosyalar-design.md`](./sahipsiz-dosyalar-design.md) (sahipsiz dosya görünürlüğü).
