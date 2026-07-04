# D6 Legal Semantics & Compliance Triage (FAZ 2)

## D6A-2 / D6A-2-SURFACE Hukukî Semantik Kararları

**Tarih:** 2026-07-04 · **Statü:** RATIFIED (owner, 2026-07-04) · **Yetki:** Bu belge D6 domaininin Q2-Q6 hukukî/mimari kararlarının kanonik kaydıdır. `docs/design/d6-final-architecture.md` (FAZ 0, PR #899) ve D6A-2-SURFACE implementasyonu (FAZ 1, PR #903) ile birlikte okunmalıdır.

---

## 0. OWNER RATİFİKASYONU (2026-07-04)

Bu belge, FAZ 0'da (`d6-final-architecture.md`, Bölüm 5.3) açık bırakılan Q2-Q6 sorularının GO-ANALYZE/docs-only bir triage turunun ardından owner tarafından ratifiye edilmiş halidir. Aşağıdaki metin owner'ın verdiği onay metninin birebir kaydıdır.

```text
OWNER_RATIFICATION: FAZ 2 — D6 Legal Semantics & Compliance Triage APPROVED.

Q2 APPROVED:
Retention decision is framework-level only.
Do not lock fixed year counts yet.
Canonical rule:
D6A-2 records are retained until the affected case lifecycle floor plus buffer
OR a calendar retention ceiling, whichever is longer.
Hard-delete is not the first-line policy; anonymization is preferred first.
Exact durations require separate owner/legal-counsel confirmation.
No code. No migration.

Q3 APPROVED:
recipientUserId remains scalar, not a Prisma relation.
Do not convert it to User relation.
Do not introduce cascade/delete semantics.
User hard-delete is not a D6 assumption.
Inactive user model remains the current operational assumption.
Inactive-recipient pending notification sweep may be a later backlog item.
No migration required for the decision itself.

Q4 APPROVED:
changeSummary remains fixed Turkish short-term.
fieldGroup is the semantic code.
Future i18n, if needed, is solved in presentation/UI layer from fieldGroup/severity.
No new DB column. No migration. No raw PII in changeSummary.

Q5 APPROVED:
Tebligat/Collection impact is a separate read-only/manual-review bridge backlog.
D6 must not create automatic legal conclusions.
D6 must not invalidate tebligat.
D6 must not stop collection/enforcement automatically.
At most, D6 may later surface "manual legal review recommended" based on
active/pending Tebligat/Collection signals. Relationship to D6A-2 is read-only.

Q6 APPROVED:
acknowledge means only seen/read.
acknowledge does not mean legal acceptance.
acknowledge does not mean action taken.
acknowledge does not mean risk resolved.
acknowledge does not mean file operation completed.
Future action/resolution tracking belongs to Task/workflow domain, not
directly to D6A-2. UI copy must preserve this distinction.
```

**Sonuç:** Q2-Q6 çerçeve-seviyesinde LOCKED. Kesin sayısal değerler (Q2'nin retention süreleri gibi) ayrı bir owner + hukuk danışmanı teyidi gerektirir — bu belge o teyidi VERMEZ, yalnız çerçeveyi kilitler.

---

## 1. Q2 — RETENTION / PURGE

**Hukukî mesele:** KVKK m.4 (ölçülülük/amaca uygunluk) ve m.7 (amaç ortadan kalkınca silme/yok etme/anonimleştirme yükümlülüğü) sınırsız saklamayı yasaklar; Avukatlık Kanunu m.34 özen borcu ise D6 audit izinin ileride bir uyuşmazlıkta değerli olabileceğini gösterir. İki ilke arasında denge gerekir.

**Mevcut repo durumu:** `DebtorCrossCaseNotification`'da purge/anonymize mekanizması yok. Tek lifecycle: PENDING → ACKNOWLEDGED | EXPIRED. EXPIRED/ACKNOWLEDGED kayıtlar süresiz saklanıyor. Repo'da zaten var olan emsal: `calc-preview/break-glass` modülü `retentionDays`/`retentionPolicy` (STANDARD/LEGAL_HOLD/PROMOTED) ile kategorize retention kullanıyor.

**Risk:** Sınırsız birikim KVKK veri-minimizasyonu riski taşır; çok erken/agresif purge ise olası bir özen-borcu uyuşmazlığında elindeki tek kanıtı yok edebilir.

**RATIFIED KARAR:** Retention kararı ÇERÇEVE-SEVİYESİNDE kilitlenir, kesin sayı KİLİTLENMEZ:
> D6A-2 kayıtları, ilgili affectedCase yaşam-döngüsü tabanı + tampon süresi İLE takvim-tabanlı bir üst-sınır süresinden HANGİSİ DAHA UZUNSA o kadar saklanır. Hard-delete ilk-sıra politika DEĞİLDİR; önce anonymize tercih edilir. Kesin süreler ayrı bir owner/hukuk-danışmanı teyidiyle belirlenir.

**Implementation etkisi:** LATER BACKLOG + migration (D6-RETENTION). Bu turda kod/migration YOK.

---

## 2. Q3 — recipientUserId / USER SİLİNMESİ

**Hukukî mesele:** Personel ayrılırsa/hesabı kaldırılırsa, "kime gitti" denetlenebilirliği ile gereksiz-veri-tutmama ilkesi arasında denge.

**Mevcut repo durumu:** `recipientUserId` zaten SCALAR (Prisma relation DEĞİL) — hem `DebtorCrossCaseNotification`'da hem emsali `PoaExpiryNotificationDelivery`'de aynı kasıtlı idiom. `User` modelinde hard-delete HİÇBİR YERDE kullanılmıyor (repo geneli grep: 0 sonuç); yalnız `isActive` ile pasifleştirme var.

**Risk:** Asıl risk User-silinmesi değil — `resolveRecipients()` yalnız ÜRETİM anında `isActive` kontrolü yapıyor; üretimden SONRA deaktive olan bir personelin var olan PENDING kayıtları hiç ek işlem görmeden kalıcı olarak "kimse görmeyecek" halde PENDING kalabilir.

**RATIFIED KARAR:**
> `recipientUserId` kalıcı olarak SCALAR kalır (relation'a çevrilmez, cascade/delete semantiği eklenmez). User hard-delete D6 için bir varsayım DEĞİLDİR — mevcut inactive-user modeli operasyonel varsayım olarak kalır. Deaktif-alıcının PENDING kayıtları için erken-expire sweep'i AYRI, LATER bir backlog maddesi olabilir (migration gerektirmez).

**Implementation etkisi:** Karar kendisi NONE (mevcut tasarım zaten doğru). Sweep-geliştirmesi istenirse LATER BACKLOG (D6-INACTIVE-RECIPIENT-SWEEP), migration YOK.

---

## 3. Q4 — changeSummary / İ18N

**Hukukî mesele:** ADR-011 (ham PII yok, yalnız sabit sistem etiketi) ile gelecekteki çoklu-dil ihtiyacı arasında çatışma olmamalı.

**Mevcut repo durumu:** `changeSummary` zaten sabit `FIELD_GROUP_SUMMARY` haritasından geliyor — `fieldGroup` enum'u (ADDRESS/KEP_ADDRESS/IDENTITY/NAME) zaten "semantic code" işlevi görüyor. Repo'da ayrı bir modülde (`calc-preview/explanation`) "semantic code + gelecekte i18n key" deseni zaten kullanılıyor.

**RATIFIED KARAR:**
> `changeSummary` kısa vadede sabit Türkçe kalır. `fieldGroup` semantic code olarak yeterlidir. İleride i18n gerekirse çözüm SUNUM/UI KATMANINDA (`fieldGroup`/`severity`'den türetilerek) yapılır; yeni DB kolonu/migration EKLENMEZ. Ham PII kuralı (ADR-011) korunur.

**Implementation etkisi:** NONE şimdilik (doc-only karar). İleride yalnız FE değişikliği, migration YOK.

---

## 4. Q5 — TEBLİGAT / COLLECTION AKTİF SÜREÇ ETKİSİ

**Hukukî mesele:** Borçlu adres/kimlik değişikliği aktif bir tebligat/tahsilat sürecini etkiliyorsa bunu görmezden gelmek ihmal; ama bunu OTOMATİK bir hukukî hükme (örn. "bu tebligat artık geçersiz") dönüştürmek yetki-aşımı riski taşır (Tebligat Kanunu m.35 mekanizması resmi kayda ve icra/hâkim kararına dayanır).

**Mevcut repo durumu:** `Collection.caseDebtorId` ve `Tebligat.caseDebtorId` artık gerçek Prisma `@relation` (D5B/D5C). Teknik olarak sorgu mümkün, ama D6A-2 bunu hiç yapmıyor — bilinçli bir kavramsal sınır. Repo'da zaten "manual review" idiomu var (`needsReview`, `manualReviewCaseIds`, `OTHER_SUSPENSE_MANUAL_REVIEW`).

**RATIFIED KARAR:**
> Tebligat/Collection etkisi AYRI, SALT-OKUMA bir bridge/backlog işidir. D6, tebligatı geçersiz kılmaz, tahsilat/icra sürecini otomatik durdurmaz, hiçbir otomatik hukukî hüküm üretmez. Olsa olsa ileride "manuel hukukî inceleme önerilir" sinyalini, ilgili CaseDebtor'daki aktif/bekleyen Tebligat/Collection kayıtlarına dayanarak SALT-OKUMA olarak sunabilir. D6A-2 ile ilişkisi READ-ONLY'dir; D6A-2'nin çekirdek modeline hiçbir yazma yapılmaz.

**Implementation etkisi:** LATER BACKLOG (D6-TEBLIGAT-BRIDGE), migration muhtemelen gerekmez (FK'ler zaten var) — bir sonraki GO-ANALYZE'da teyit edilmeli.

---

## 5. Q6 — ACKNOWLEDGE vs ACTION/RESOLUTION

**Hukukî mesele:** "Gördüm" ile "gerekli işlemi yaptım" ayrılmazsa, ileride "sistem bildirdi, gördüm, demek ki özenimi gösterdim" şeklinde yanlış bir savunma argümanına dönüşme riski var.

**Mevcut repo durumu:** D6A-2 modelinde "gördüm" (`acknowledgedAt`) dışında hiçbir "önlem alındı" izi yok. Genel bir Task/workflow domaini repo'da zaten var (`User.assignedTasks`, `CaseTaskEscalationEvent` benzeri yapılar).

**RATIFIED KARAR:**
> `acknowledge` yalnız "gördüm/okudum" anlamına gelir. Hukukî kabul, işlem yapıldı, risk giderildi veya dosya işlemi tamamlandı anlamına GELMEZ. İleride action/resolution izlemesi istenirse bu D6A-2 modeline gömülmez; mevcut Task/workflow domaine opsiyonel bir link (örn. `linkedTaskId`) olarak modellenir. UI copy bu ayrımı korumak zorundadır.

**Implementation etkisi:** NONE kısa vadede (yalnız UI-copy kararı, ileriki UI fazında uygulanır). `linkedTaskId` istenirse LATER MIGRATION (D6-TASK-LINK).

---

## 6. KANONİK KİLİT CÜMLE (D6'nın hukukî kimliği)

```text
D6 bildirimi, borçlu çekirdek verisindeki değişikliğin diğer dosyalarda
manuel hukukî inceleme gerektirebileceğini gösteren iç dikkat ve audit kaydıdır.

D6:
- tebligat değildir
- hukukî kabul değildir
- dosya işlemi değildir
- riski otomatik gidermez
- avukatın gereğini yaptığını ispatlamaz
- tebligat/collection üzerinde otomatik hüküm üretmez

D6 yalnız:
- değişiklik olayını
- etkilenen dosyayı
- bildirilen kullanıcıyı
- görüldü/görülmedi/expire bilgisini
- audit izini
gösterir.
```

---

## 7. NO-GO BOUNDARIES

- D6, bir tebligatın geçersiz olduğunu HÜKMETMEZ.
- D6, bir tahsilat/icra sürecini OTOMATİK DURDURMAZ.
- D6, "acknowledged"i hukukî kabul/feragat/onay SAYMAZ.
- D6, avukatın özen borcunu yerine getirdiğini KANITLAMAZ.
- D6, kendi başına bir görev-yönetim/iş-takip sistemi HALİNE GELMEZ.
- D6, Collection/Tebligat modellerine hiçbir şekilde YAZMA yapmaz.
- D6, User hard-delete senaryosuna göre migration/relation değişikliği YAPMAZ (bu senaryo bugün repo'da gerçekleşmiyor).

---

## 8. KARAR TABLOSU (özet)

| Soru | Ratified Karar | STATUS |
|---|---|---|
| Q2 Retention/purge | Case-lifecycle-anchored floor + calendar ceiling (hangisi uzunsa); önce anonymize; kesin süre AYRI teyit | LOCKED (çerçeve) |
| Q3 recipientUserId/User deletion | Scalar kalır; User hard-delete varsayılmaz; inactive-recipient sweep LATER | LOCKED |
| Q4 changeSummary/i18n | Kısa vadede sabit Türkçe; ileride sunum-katmanında i18n | LOCKED |
| Q5 Tebligat/Collection bridge | Ayrı, salt-okuma backlog; otomatik hüküm YOK | LOCKED |
| Q6 acknowledge vs action | acknowledge=yalnız gördüm; action/resolution Task domaine link | LOCKED |

---

## 9. NEXT BACKLOG CANDIDATES

Aşağıdaki 4 aday `product-backlog.md`'ye bu belgeyle birlikte eklenmiştir (hepsi BACKLOG statüsünde, implementasyon yetkisi VERMEZ):

- **D6-RETENTION** (Q2): Retention/anonymize cron + gerekirse yeni `purgedAt`/`anonymizedAt` alanı.
- **D6-INACTIVE-RECIPIENT-SWEEP** (Q3): Deaktif-alıcının PENDING kayıtlarını erken-EXPIRE eden sweep.
- **D6-TEBLIGAT-BRIDGE** (Q5): CaseDebtor bazında aktif Tebligat/Collection sayısını salt-okuma sunan rapor/endpoint.
- **D6-TASK-LINK** (Q6): Opsiyonel `linkedTaskId` alanı + Task-oluşturma entegrasyonu.

---

**GOVERNANCE NOTU:** Bu belge Q2-Q6'yı ÇERÇEVE seviyesinde kilitler. Yukarıdaki 4 backlog adayından herhangi biri GO-IMPLEMENT'e geçmeden önce ayrı bir owner onayı ve (Q2 için) hukuk danışmanı teyidi gerekir. Bu belge tek başına implementasyon yetkisi VERMEZ.
