# OFFICE YAZMA KABUL PAKETİ — R01 (A-02)

```text
Kimlik      : OFFICE-YAZMA-KABUL-PAKETI-R01
Plan kalemi : A-02 (OFFICE-BUTUNSEL-CANLI-TESLIM-PLANI-R01 · N=7)
Tarih       : 2026-09-08
Taban       : main 93f04f676f6e2d25efcd6674e37e44837bb70b04
Amaç        : A-03 (ayar PUT) · A-04 (avukat/personel yazma) · A-05 (personel okuma) ·
              A-06 (raporlama hattı) · A-07 (onay akışı) kabullerinin ORTAK sözleşmesi
Yetki       : Bu paket KOŞUM YETKİSİ ÜRETMEZ. Canlı yazma yalnız izolasyonu doğrulanmış
              sentetik tenant'ta ve A-01 (cutover) tamamlandıktan sonra yapılır.
Yasak       : Gerçek müşteri verisine test yazımı · gerçek alıcıya test gönderimi ·
              gerçek tenant'ta yazma · `purge` · geri alınamaz kayıt üretimi
```

## 1. Hedef sentetik alan

Mevcut hiçbir tenant kullanılmaz. Gerekçeleri ölçülmüş sahiplikler:

| Tenant | Neden kullanılamaz |
|---|---|
| `demo-firma` | Gerçek ofisle paylaşılan kullanıcı domainleri + 7 aktör audit izi + canlı muhasebe (PR #2542) |
| `c36-smoke-principal`, `c36-smoke-principal-2` | C36 smoke ölçüm alanı |
| `local-development-office` | Başka programın ölçüm alanı (CAP-02 canary yolunda `INELIGIBLE`) |
| `f04-acc-<runId>` | F04 kabul hattına ait; OFFICE kabulüne devredilmez |

**Paket kendi tenant'ını üretir: `off-acc-<runId>`.** Aktör e-postaları
`off-<runId>-<rol>@office-acceptance.invalid` — RFC 2606 `.invalid`, **teslim edilemez**.
Parolalar yalnız bellekte üretilir, alt sürece env ile geçirilir, hiçbir yere yazılmaz ve
stdout'a basılmaz.

## 2. F01 yetki sözleşmesi (koddan ölçüldü)

`OfficeApprovalService.isF01ActorAuthorized(userId, tenantId, targetOfficeId?)`:

```text
user yok | isActive=false | user.tenantId != tenantId        -> false
user.staffMember VAR                                          -> false  (personel kimliği Office aktörü OLAMAZ)
targetOfficeId && lawyer.officeId && farklı                    -> false
user.role === 'ADMIN'                                          -> true   (kanonik süper-admin eşlemesi)
aksi halde: lawyer + lawyer.officeId ZORUNLU ve
  lawyerRank ∈ {PARTNER, MANAGER} || canApproveOfficeActions   -> true
```

Bu sözleşme kabul aktörlerini belirler: **pozitif aktör** ADMIN kullanıcı (veya PARTNER avukat
bağlı kullanıcı), **negatif aktör** `staffMember` bağlı kullanıcı (F01'de her koşulda `false`).

## 3. Kurulum — tam satır envanteri (atomik)

| # | Satır | Amaç |
|---|---|---|
| 1 | `Tenant` `off-acc-<runId>` | izolasyon sınırı |
| 2 | `Office` (tek satır) | ayar yüzeylerinin hedefi |
| 3 | `User` ADMIN (F01 pozitif) | A-03/A-04/A-06 aktörü |
| 4 | `Lawyer` PARTNER (User #3'e bağlı, Office #2) | onay uygunluğu + avukat yazma hedefi |
| 5 | `User` personel (F01 negatif) | A-05 yetkisiz yol |
| 6 | `StaffMember` (User #5'e bağlı) | personel okuma/maskeleme + F01 negatif kanıtı |
| 7 | `Lawyer` ikinci (ast) | A-06 raporlama hattı ataması |

**Kurulum toplamı: 7 satır**, tek transaction — kesilirse ROLLBACK, hiçbir satır kalmaz.
Mevcut hiçbir satır güncellenmez veya silinmez.

## 4. Kabul adımları ve ölçütleri

| ID | Kapsam | Ölçüt (hepsi ölçülebilir) | Ürettiği yazma |
|---|---|---|---|
| **A-03** | 8 ayar yüzeyinde `PUT` (`/office`, `bank-accounts`, `smtp`, `sms`, `greeting`, `iik78`, `poa-expiry`, `escalation`) | Yetkili 2xx · **yalnız hedef alan değişti** (öncesi/sonrası alan-alan karşılaştırma) · yanıtta S2 alanı ve açık secret **YOK** · yetkisiz 403 `OFFICE_F01_AUTHORIZATION_REQUIRED` · anonim 401 · **izlenen diğer tenant'larda fark 0** | Yalnız `off-acc` Office satırı; banka hesabı adımı +1 satır (sonra silinir, aynı adımda) |
| **A-04** | Avukat + personel yazma (`POST/PUT/PATCH/DELETE`, `order/update`) | create 2xx; **DTO dışı alan reddi**: `uyapToken`, `eSignatureSerial`, `tenantId`, `officeId` gönderimi 4xx (F-B01-05 sınırı) · update'te kimlik/ilişki/nested reddi 4xx (#2511) · **aynı-boolean `isActive` kabul edilir ama yazılmaz**; gerçek geçiş ve geçersiz tip reddedilir · delete sonrası eski form ile yeniden etkinleştirme **imkânsız** | `off-acc` içinde 1 avukat + 1 personel satırı (oluştur→güncelle→sil, net 0) |
| **A-05** | Personel okuma (`GET /staff`, `/staff/:id`) | Yetkili 200 + liste maskeleme kuralı uygulanıyor · `staffMember` bağlı aktör yazma uçlarında 403 · anonim 401 | Yazma yok |
| **A-06** | Raporlama hattı (`/reporting-lines`) | ADMIN 200 (`list`/`eligible`/`reconciliation`) · ADMIN-dışı 403 · anonim 401 · `assign`/`end`/`top-level` yalnız `off-acc` içinde; FOUNDER kimliği ReportingLine'dan bağımsız (D-WR-6) | 1 `ReportingLine` satırı (assign→end, kayıt korunur) |
| **A-07** | Onay akışı (`/office-approvals`) | `inbox`/`mine` 200 · yetkisiz aktör 403 · onay/ret ADR-009 tek motor izi (`OFFICE_APPROVAL_EXECUTION_*`) · P4 approval-record zorunluluğu görünür | 1 `OfficeApprovalRequest` + karar kaydı |

**A-07 fixture kuralı:** onay isteğinin `actionCode`'u, **finansal zincir kurulmasını gerektirmeyen
en dar** koda göre koşum anında seçilir ve kanıtla belgelenir. Böyle bir kod yoksa A-07 **okuma
yüzeyi + yetki negatifi** ile sınırlanır ve bu sınır kayda geçer — uydurulmuş fixture ile
genişletilmez.

## 5. Korunacak kayıtlar

`AuditLog`, `OfficeApprovalRequest` ve karar kayıtları, `ReportingLine` geçmişi ve tüm denetim
izleri **korunur** — kapanış bunlara dokunmaz ve dokunmadığı doğrulanır. `IcrabotTimelineEntry`
DB seviyesinde silinemez; bu paket onu **hiç yazmaz**.

## 6. Kapanış ve yasaklar

| Mod | Ne yapar | Canlıda |
|---|---|---|
| **`revoke-access`** (varsayılan kapanış) | Sentetik `User` satırlarında `isActive=false` + `tokenVersion++` → mevcut JWT geçersiz, yeni login **401**. Finansal/audit kayıtlara dokunulmaz ve bu doğrulanır | ✅ |
| `preserve` | Yazma 0; envanter raporlanır | ✅ |
| `purge` | Sentetik tenant ve satırların silinmesi | ❌ **canlıda YASAK** (yalnız disposable ortam) |

Kapanış, kurulum/kabul adımları başarısız olsa bile `finally` yolunda çalışır; kapanış
doğrulanamazsa sonuç **"kapanış DOĞRULANAMADI"** olarak raporlanır, sessiz geçilmez.

## 7. Durma koşulları (fail-closed)

- Ön koşul FAIL → yazma **başlamaz**.
- Ölçüm yapılamıyorsa sonuç **`OLCULEMEDI`** + nonzero; "sorun yok" **sayılmaz**.
- HTTP sonucu belirsizse **istek tekrarlanmaz**; kalıcı durum salt-okuma ile uzlaştırılır.
- Kurulum yarıda kesilirse ROLLBACK → hiçbir satır kalmaz.
- İzlenen tenant'larda fark ölçülemezse (boş küme) → FAIL.
- Gerçek tenant'a herhangi bir yazma girişimi → **HARD STOP**.

## 8. Prova (disposable) planı

Canlı koşumdan önce paket, disposable PostgreSQL üzerinde uçtan uca prova edilir: kurulum 7/7,
A-03…A-07 ölçütleri, kapanış doğrulaması ve negatif kontroller (yetkisiz aktör, DTO dışı alan,
cross-tenant hedef, geçersiz tip). Prova sonuçları **canlı kabul yerine geçmez**; yalnız paketin
kendi doğruluğunu kanıtlar.

## 9. Sınırlar

Bu paket **A-01 tamamlanmadan çalıştırılmaz** (F-B01-04/F-B01-05 sınırları canlıda olmalı ki
A-04'ün DTO reddi ölçülebilsin). Yeni yetki üretmez; tek-kullanımlık authority, mühür ve yürütücü
kontrolleri aynen geçerlidir.

## 10. UYGULANABİLİRLİK ŞERHİ — R01'in iki kusuru (2026-09-08, append-only)

Bu paket bir **sözleşme belgesidir**; çalıştırılabilir betik içermez. Harness'ı uygulayıcı
sayfa (OFFİCE 33-F04) yazar. Prova sırasında sözleşmenin **iki** kusuru ölçümle ortaya çıktı.
§1–§9 tarihsel metni değişmez; aşağıdaki hükümler onları düzeltir ve uygulayıcı için bağlayıcıdır.

### 10.1 §7'nin "boş küme → FAIL" kuralı ZORLANMIYORDU

§7 şunu yazıyor: *"İzlenen tenant'larda fark ölçülemezse (boş küme) → FAIL."* Kural doğruydu
ama **nasıl zorlanacağı** yazılmamıştı. Sonuç: F04'ün ilk prova koşumu, izlenen tenant sayısı
**0** iken "fark 0" görüp **PASS** verdi. Ölçüm yapılmamıştı; ölçüt yine de sağlanmış göründü.

**Kusur sınıfı:** gözlem kümesi boşken **kendiliğinden sağlanan** ölçüt. Bu, F04 hattında daha
önce kayda geçen fail-open sınıfının aynısıdır — *ölçülemeyen sonuç "yok" sayılmaz*.

**Bağlayıcı düzeltme:**

1. İzlenen tenant kümesi **boşsa HARD FAIL** — koşum nonzero ile biter, "fark 0" raporlanamaz.
2. Fark ölçümü, kabul kapsamı **DIŞINDA** en az bir **seyirci tenant** üzerinden okunur. Taze
   disposable DB'de başka tenant bulunmadığı için seyirci tenant kurulum aşamasında yaratılır.
3. Seyirci tenant için iki şey **kanıtlanır**: kabul kapsamı dışında olduğu **ve** ona hiçbir
   yazma yapılmadığı. (Aksi hâlde "fark 0" yine anlamsızdır — bu kez farklı sebeple.)
4. Kurulum envanteri bu nedenle **7 satır + seyirci tenant** olur; §3'ün 7 satırlık çekirdeği
   değişmez, seyirci tenant **ölçüm altyapısıdır**, kabul hedefi değildir.

Aynı sınama her sayısal ölçüte uygulanır: bir ölçüt "0 / fark yok / ihlal yok" diyorsa, önce
**gözlem kümesinin boş olmadığı** kanıtlanır.

### 10.2 §4'ün A-07 geri-düşüş kuralı DEVREYE GİRDİ — ölçümle

§4, A-07 için *"finansal zincir gerektirmeyen en dar `actionCode` koşum anında kanıtla seçilir;
hiçbiri uygun değilse A-07 okuma yüzeyi + yetki negatifi ile sınırlanır"* diyordu. Tarama
yapıldı ve **böyle bir kod bulunmadı**. Ölçüm (ana yürütücü tarafından koddan bağımsız
doğrulandı):

| Ölçüm | Bulgu |
|---|---|
| Yürütme izini üreten tek yol | `OfficeApprovalExecutorService.execute` — kapsam guard'ı `actionCode !== 'CHANGE_STATUS' \|\| targetType !== 'LegalCase'` → `UNSUPPORTED_ACTION_CODE`. Başka hiçbir `actionCode` `OFFICE_APPROVAL_EXECUTION_*` izini executor üzerinden üretmez |
| `CHANGE_STATUS/LegalCase` bedeli | §3'ün 7 satırında `Case` yok → **8. satır** gerekir; **ve** `OfficeApprovalExecutorCron` kapsamı **tam da budur** (`SCOPE = { actionCode:'CHANGE_STATUS', targetType:'LegalCase' }`) ve üç `findMany` sorgusunun üçünde de **tenantId yüklemi YOKTUR** (kod yorumu bunu "CROSS-TENANT" diye kasıtlı belgeliyor) → canlıda bırakılan fixture arka planda **kendiliğinden yürütülebilir** |
| `COLLECTION_DISPOSITION_POST` bedeli | Yürütme izini gerçekten üretir ama executor üzerinden değil, disposition posting yolundan; **tam finansal zincir** ister |
| `OFFICE_APPROVAL_EXECUTOR_ENABLED` | Cron'u kapatır (kapalıyken `findMany` hiç çağrılmaz) — fakat **kabul güvencesi sayılmaz**: konfig bir değişkendir, kanıt değil |

**Sonuç:** finansal zincir gerektirmeyen en dar kod ile ADR-009 yürütme izini **aynı anda**
sağlayan aday **yoktur**. Bu sürümde **canlı A-07, okuma yüzeyi + yetki negatifi ile
SINIRLANIR**; yürütme-izi ölçütü **kapanmaz, açık kalır** ve teslim tablosunda bu sürümün
açık sınırı olarak görünür. Uydurulmuş fixture ile genişletilmez.

`CHANGE_STATUS/LegalCase` yolunun açılması **envanter (8. satır) ve risk (cron çarpışması)
değişikliğidir**; uygulayıcının da ana yürütücünün de yetkisinde değildir — **owner kararına
bağlıdır**.

### 10.3 Derleme provenance'ı

Prova, uygulamayı **sabit aday `d2223e78`** ile özdeş ağaçtan derler. Bugün ölçülen eşitlik:

```text
d2223e78:project/apps  tree = b26d922cd7f39121b0881b62305d6e90908c80e0
f8d15f73:project/apps  tree = b26d922cd7f39121b0881b62305d6e90908c80e0   → EŞİT
```

Kanıt bu iki hash ile adaya bağlanır. Harness dalının **git tabanı** ayrı bir konudur ve
güncel main'de kalabilir; bağlayıcı olan **ne derlendiğidir**. Harness `project/apps` altına
dokunmaz (delta 0) — aksi hâlde sabit aday ve plan §8.3'teki devralınan kabuller geçersizleşir.
