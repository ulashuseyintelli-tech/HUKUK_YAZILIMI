# Pending Migration Coordination Register

```text
Belge yolu : project/docs/governance/pending-migration-coordination-register.md
Durum      : LIVING / NON-NORMATIVE COORDINATION SURFACE
Rol        : Gerçek hukuk_db üzerinde `prisma migrate status` ile tespit edilen, henüz
             live-apply edilmemiş migration kuyruğunu cross-workstream görünür kılar.
             Domain governance, semantic authority veya implementation izni ÜRETMEZ;
             yalnız hangi migration'ın hangi workstream'e ait olduğunu ve hangi owner
             yetkisini beklediğini kaydeder.
Kuruluş    : 2026-07-21, OFFICE-AUTH-P02-HARDENING-R01 GO-MIGRATE preflight'inde tespit
             edilen migration-queue collision üzerine owner talimatıyla açıldı.
```

## 1. Neden bu belge var

OFFICE-AUTH-P02-HARDENING-R01 için verilen bir GO-MIGRATE görevi sırasında, gerçek
`hukuk_db` üzerinde `prisma migrate status` çalıştırıldığında **4 pending migration**
tespit edildi — yalnız görevin hedef aldığı migration değil. Prisma'nın canonical
`prisma migrate deploy` komutu pending migration'ları **sıralı ve topluca** uygular;
belirli bir migration'ı atlayıp yalnız birini seçerek uygulayan bir mekanizma yoktur.
Bu nedenle tek bir workstream'in GO-MIGRATE yetkisi, farkında olmadan başka
workstream'lerin migration'larını da canlıya taşıyabilir. Bu belge bu riski görünür
kılmak ve her migration'ın kendi owner yetkisini beklemesini sağlamak için açılmıştır.

## 2. Tespit anındaki durum (2026-07-21, salt-okuma preflight kanıtı)

**DB kimliği:** host `hukuk-postgres` (localhost:5432), database `hukuk_db`, 3 tenant
(read-only `SELECT COUNT(*) FROM "Tenant"` ile doğrulandı).

| # | Migration | Domain | İlişki | Durum |
|---|---|---|---|---|
| 1 | `20260720225814_office_auth_p02_password_reset_token` | OFFICE | Migration #3'ün **zorunlu ön koşulu** (`PasswordResetToken` tablosunu ve `PasswordResetToken_userId_fkey` FK'sini yaratır; #3 bu FK'yi `DROP CONSTRAINT` ile hedefler) | OFFICE-AUTH-P02 baseline'ının kendi migration'ı; koda göre "BASELINE IMPLEMENTED/CANONICAL" ama DB'ye hiç uygulanmamış |
| 2 | `20260721002219_legal_application_writer_evidence` | LEGAL APPLICATION | OFFICE'le ilişkisiz | **Ayrı owner yetkisi gerekli** — bu register'da değerlendirilmedi, o workstream'in kendi sorumluluğu |
| 3 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | OFFICE | PR #1494 ile merge edilen hardening migration'ı | Bu GO-MIGRATE görevinin doğrudan hedefi |
| 4 | `20260721063256_client_p2_u02_portal_user_token_version` | CLIENT | OFFICE'le ilişkisiz | **Ayrı owner yetkisi gerekli** — BOUNDARY EXIT ile açıkça bu görevin kapsamı dışında bırakılmıştır |

**Ek salt-okuma doğrulaması:** `PasswordResetToken` tablosu DB'de yok
(`to_regclass('public."PasswordResetToken"')` → NULL); `ClientPortalUser.tokenVersion`
kolonu da yok. Her iki bulgu da yukarıdaki "hiç uygulanmamış" tespitiyle tutarlıdır.
Migration dosyalarının içeriği (`git show`/doğrudan okuma ile) doğrulandı: #1 ve #3
yalnız `User`/`PasswordResetToken` şemasına dokunur, #2/#4 ise sırasıyla kendi
domainlerine özgü, birbirinden ve OFFICE'ten bağımsız tek-amaçlı DDL'lerdir. Migration
#3 içinde RCV-COL FK isimlendirme drift'ine dair hiçbir statement YOKTUR.

## 3. Owner kararı (2026-07-21) — MIGRATION QUEUE COLLISION

Owner, bu tespit üzerine OFFICE-AUTH-P02-HARDENING-R01 GO-MIGRATE görevini durdurdu:

```text
CURRENT GO-MIGRATE:
SUSPENDED / BLOCKED AT PREFLIGHT
```

**Bağlayıcı DO-NOT listesi** (owner talimatından birebir):
- `prisma migrate deploy` çalıştırılmaz.
- Dört migration OFFICE yetkisi altında topluca uygulanmaz.
- `migrate resolve` kullanılmaz.
- Manuel DDL veya seçici schema mutation yapılmaz.
- Pending migration klasörleri silinmez, taşınmaz veya yeniden adlandırılmaz.
- Migration geçmişi rewrite edilmez.

Bu belgenin kendisi de canlı DB mutation'ı İÇERMEZ; yalnızca preflight kanıtını
canonical olarak kaydeder.

## 4. Workstream bazlı disposition

| Workstream | Migration(lar) | Disposition | Sonraki adım |
|---|---|---|---|
| **OFFICE** (AUTH-P02 baseline + HARDENING-R01) | #1 + #3 | SUSPENDED / BLOCKED AT PREFLIGHT | Bu register'daki queue collision çözülmeden OFFICE'in kendi GO-MIGRATE'i devam edemez. IMPLEMENTATION AUTHORITY: NONE (migration'lar merge edilmiş/CI-geçmiş ama canlıya hiç uygulanmamış). |
| **LEGAL APPLICATION** | #2 | **Bu register'da değerlendirilmedi** | Kendi workstream owner'ından ayrı GO-MIGRATE yetkisi gerekir. |
| **CLIENT** (P2-U02) | #4 | **Bu register'da değerlendirilmedi** | Kendi workstream owner'ından ayrı GO-MIGRATE yetkisi gerekir; bu görevin BOUNDARY EXIT'i CLIENT kapsamına girmeyi açıkça yasaklamıştır. |

## 5. Çözüm için olası yönler (owner kararı gerektirir — bu belge SEÇMEZ)

Bu register hiçbir yönü seçmez veya önermez; yalnız aşağıdaki seçeneklerin var
olduğunu ve her birinin ayrı bir owner kararı gerektirdiğini kaydeder:
- Her workstream owner'ı kendi migration'ı için ayrı GO-MIGRATE yetkisi verir; migration'lar
  `prisma migrate deploy`'un doğal sıralı-toplu davranışıyla tek bir apply penceresinde
  ama TÜM ilgili owner'ların açık onayıyla birlikte uygulanır.
  - **Şema/veri riski analizi:** #2 ve #4 saf additive/tek-kolon DDL'lerdir (owner
    onaylarından bağımsız olarak dosya içeriği doğrulandı); #1+#3 zinciri de additive
    (yeni tablo + composite FK + partial index). Şu ana kadarki kanıt hiçbirinin
    diğerini veri/şema seviyesinde bozacağına dair bir işaret taşımıyor — ama bu,
    ilgili owner'ların KENDİ migration'ları için ayrı GO-MIGRATE yetkisi vermesinin
    yerine geçmez.
- Migration dosyalarının kendisi (sıra/adlandırma) korunarak, yalnız hangi migration
  setinin uygulanacağına dair owner'lar arası bir zamanlama/sıra mutabakatı sağlanır.
- OFFICE kendi payını (#1+#3) beklemeye devam eder; #2/#4 başka bir GO-MIGRATE
  penceresinde (bu register'daki tespitten bağımsız olarak) kendi owner'larınca
  ele alınır — ama unutulmamalı: `prisma migrate deploy` DAİMA TÜM pending
  migration'ları uygular, dolayısıyla #2/#4'ü uygulayan biri istemeden #1/#3'ü de
  uygulamış olur (ve tersi).

## 6. İlgili kayıtlar

- `decision-log.md` — bu register'ın kuruluş kaydı (2026-07-21,
  `OFFICE-AUTH-P02-HARDENING-R01-GOMIGRATE-SUSPEND-01`).
- `GOVERNANCE-INDEX.md` — bu register'ın harita girişi.
- PR #1494 (`b9916f5bfe9a27e483d779e5c98d31828552f92e`) — HARDENING-R01'in kod tarafı,
  MERGED/CANONICAL; bu register yalnız DB-apply tarafını kapsar.

---

## 7. CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01 — GO-ANALYZE + GO-DOCS sonucu (2026-07-21)

**Mode:** READ-ONLY MIGRATION COORDINATION. Gerçek `hukuk_db`'de HİÇBİR mutation
yapılmadı; bu bölüm yalnız salt-okuma `prisma migrate status`, salt-okuma SQL
sorguları ve **disposable** (izole, tek-kullanımlık, bu görevle birlikte imha
edilen) Postgres konteynerleri üzerindeki rehearsal/backup-restore-doğrulama
kanıtını kaydeder.

**Owner review düzeltmesi (2026-07-21):** Owner bu bölümün ilk taslağını inceledi
ve 4 madde düzeltme istedi: (1) M4'ün "herhangi bir noktada icra edilebilir"
ifadesi yanlıştı — M4 şema-bağımsız ama SHA-anchored icra sırası bakımından
bağımsız DEĞİL; (2) "Prisma her migration'ı kendi transaction'ında uygular"
iddiası doğrulanmadan yazılmıştı; (3) backup-restore doğrulamasındaki "birebir
eşleşme" ifadesi kanıtın kapsamını aşıyordu; (4) M2'nin "zararsız" nitelemesi
kendi ACCESS EXCLUSIVE lock + fail-closed guard + çok sayıda constraint/trigger
ekleyen doğasını hafife alıyordu. Aşağıdaki §7.2/§7.5/§7.8/§7.9/§7.10 bu 4
düzeltmeyi yansıtacak şekilde güncellenmiştir; (2) numaralı madde için AYRICA
yeni bir empirik doğrulama yapılmış ve sonucu (owner'ın genel iddiasıyla kısmen
farklı, ama bu repo'nun gerçek stack'i için empirik olarak doğrulanmış bir
bulgu) §7.8'de kaydedilmiştir.

### 7.1 Owner/PR/SHA tablosu

| Gate | Migration | Domain | PR | Squash/Merge SHA | Merged At (UTC) |
|---|---|---|---|---|---|
| M1 | `20260720225814_office_auth_p02_password_reset_token` | OFFICE | #1481 | `7676d8514292f03914f1f46c0c67041f04489194` | 2026-07-20T23:45:06Z |
| M2 | `20260721002219_legal_application_writer_evidence` | LEGAL APPLICATION | #1470 | `9dabe8dbddecafad49dbe58958ef2c3642d14a01` | 2026-07-20T22:03:18Z |
| M3 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | OFFICE | #1494 | `b9916f5bfe9a27e483d779e5c98d31828552f92e` | 2026-07-21T07:49:30Z |
| M4 | `20260721063256_client_p2_u02_portal_user_token_version` | CLIENT | #1493 | `289068f17319c58400d3ce80770f23612b50eaa3` | 2026-07-21T14:11:28Z |

Tüm 4 SHA `git merge-base --is-ancestor <sha> origin/main` ile fresh `origin/main`
ata zinciri içinde doğrulandı. Dördü de gerçek PR merge'i (state: MERGED); hiçbiri
cherry-pick, doğrudan push veya rewrite değildir.

### 7.2 KRİTİK BULGU — gerçek kronolojik merge sırası owner'ın numaralandırma sırasından FARKLI

Owner'ın brief'i migration'ları "M1→M2→M3→M4" olarak numaralandırdı (muhtemelen
migration klasör adlarındaki timestamp'e göre — bu timestamp `prisma migrate dev`
ile migration'ın YAZILDIĞI anı yansıtır, PR'ın gerçekten merge edildiği anı DEĞİL).
`git merge-base --is-ancestor 9dabe8db 7676d851` → **YES**: **M2, M1'den ÖNCE
merge edilmiştir** (22:03 vs 23:45, aynı gün). Gerçek kronolojik merge sırası:

```text
M2 (2026-07-20T22:03:18Z) → M1 (2026-07-20T23:45:06Z) → M3 (2026-07-21T07:49:30Z) → M4 (2026-07-21T14:11:28Z)
```

**Neden önemli:** owner'ın REQUIRED EXECUTION MODEL'i "her migration'ı ilk kez
içeren canonical merge SHA'ya anchor'la, o checkout'ta `prisma migrate deploy`
yalnız sıradaki pending migration'ı uygulasın" diyor. Bu mekanizma yalnız anchor
SHA'lar GERÇEK kronolojik sırayla ziyaret edilirse çalışır — çünkü M2, M1'den önce
var olduğu için, M1'i içeren HERHANGİ bir commit (M1'in kendi merge SHA'sı dahil)
zaten M2'yi de İÇERİR. Eğer gate'ler owner'ın numaralandırdığı sırayla (M1 önce)
ziyaret edilirse, GATE M1'in `migrate deploy`'u M2'yi de sessizce uygular —
**LEGAL APPLICATION'ın kendi owner yetkisi olmadan.** Bu, tam da owner'ın
PROHIBITED listesinde yasakladığı "dört migration'ı tek bir domain yetkisi altında
topluca uygulama" durumunun sessizce gerçekleşmesi anlamına gelir.

**ÖNEMLİ — bu bağımlılık M4'ü de kapsar:** M4'ün anchor'ı (`289068f1`) M3'ün
(`b9916f5b`) DOĞRUDAN descendant'ıdır (log'da M3'ün bir sonraki commit'i) ve bu
nedenle M1+M2+M3'ün migration dosyalarının TAMAMINI zaten İÇERİR. M4 şema
düzeyinde (paylaşılan tablo/constraint/trigger yok) diğer üçünden bağımsızdır —
ama SHA-anchored icra modelinde bu ayrı bir eksendir: M4'ün anchor'ında
`prisma migrate deploy` çalıştırılırsa, M1/M2/M3 ÖNCEDEN ayrı ayrı uygulanmamışsa
DÖRDÜ DE BİRDEN uygulanır. Yani M4 "herhangi bir noktada tek başına" icra
edilemez; yalnız M2+M1+M3'ün ÜÇÜ DE önceden uygulanmışsa tek başına uygulanır.

**Bu register hiçbir gate sırasını SEÇMEZ** (owner kararı); yalnız iki seçeneği
ve sonuçlarını kaydeder:

- **Seçenek A (önerilir):** Gate'ler GERÇEK kronolojik sırayla icra edilir:
  **GATE M2 → GATE M1 → GATE M3 → GATE M4** (bu TEK sıra). Gate NUMARALARI
  (M1/M2/M3/M4 etiketleri, owner'ın brief'indeki isimlendirme) DEĞİŞMEZ; yalnız
  icra SIRASI gerçek tarihe uyar. Bu, "her adım yalnız bir sonraki migration'ı
  uygular" gereksinimini harfiyen sağlayan TEK yoldur (aşağıda §7.4'te empirik
  kanıtlanmıştır) — dördü de bu sırayla, birbiri ardınca, her biri kendi ayrı
  owner GO-MIGRATE'i ile.
- **Seçenek B:** Owner GATE M1'in GATE M2'den önce icra edilmesinde ısrar eder.
  Bu durumda GATE M1'in `migrate deploy`'u teknik olarak M2'yi de uygular. M2
  diğer üçünden şema BAĞIMSIZDIR (ortak tablo/constraint yok) — ama "zararsız"
  DEĞİLDİR: kendi başına üç tabloya `ACCESS EXCLUSIVE` lock alır, fail-closed
  boşluk kontrolü yapar ve çok sayıda `NOT NULL` kolon/constraint/trigger ekler
  (bkz. §7.3). Bu risk değerlendirmesi LEGAL APPLICATION'ın kendi owner'ına
  aittir; Seçenek B'de bu değerlendirme GATE M1'den ÖNCE, LEGAL APPLICATION'ın
  kendi ayrı GO-MIGRATE yetkisiyle yapılmış OLMALIDIR — aksi halde M2 kendi
  owner'ının açık onayı olmadan canlıya gitmiş olur.

### 7.3 Migration'lar arası teknik bağımlılıklar

- **M3 → M1 (ZORUNLU):** M3, M1'in yarattığı `PasswordResetToken_userId_fkey`
  FK constraint'ini `DROP CONSTRAINT` ile hedefler; M1 uygulanmadan M3 migration.sql
  satır 6'da başarısız olur.
- **M2, M4:** Diğer hiçbir migration'a bağımlı DEĞİLDİR (kendi domain'lerine özgü
  tablolara dokunur: `LegalApplicationBatch`/`LegalApplication`/`ApplicationAttribution`
  ve `ClientPortalUser`). M1/M3 ile hiçbir ortak tablo/constraint/trigger paylaşmazlar.
- M2'nin kendi İÇ güvencesi: migration'ın kendisi `LOCK TABLE ... ACCESS EXCLUSIVE`
  + `RAISE EXCEPTION` ile üç hedef tablodan herhangi biri BOŞ değilse fail-closed
  durur (bkz. §7.6, gerçek `hukuk_db`'de üçü de 0 satır).

### 7.4 Disposable full-chain rehearsal sonucu — EMPIRİK KANIT

Fresh disposable Postgres (`postgres:16-alpine`, geçici konteyner, iş bitince
imha edildi) üzerinde, `git archive <sha> -- project/apps/api/prisma` ile her
anchor SHA'daki `prisma/` snapshot'ı ayrı scratch dizinlerine çıkarıldı, ardından
GERÇEK kronolojik sırayla (§7.2 Seçenek A) sıfırdan sırayla deploy edildi:

| Adım | Anchor SHA | `migrate deploy` sonucu |
|---|---|---|
| 1 | `9dabe8db` (M2) | 89 migration bulundu, **89'u da uygulandı** (sıfırdan boş DB — tam geçmiş + M2) |
| 2 | `7676d851` (M1) | 90 migration bulundu, **yalnız 1 yeni** (`office_auth_p02_password_reset_token`) uygulandı |
| 3 | `b9916f5b` (M3) | 91 migration bulundu, **yalnız 1 yeni** (`office_auth_p02_hardening_r01_composite_fk`) uygulandı |
| 4 | `289068f1` (M4) | 92 migration bulundu, **yalnız 1 yeni** (`client_p2_u02_portal_user_token_version`) uygulandı |

Son `prisma migrate status`: **"Database schema is up to date!"** (92/92, sıfır
pending). Hiçbir adımda `migrate resolve`, manuel DDL veya migration dosyası
değişikliği KULLANILMADI — yalnız plain `prisma migrate deploy`, gerçek geçmiş
SHA'lara anchor'lanmış checkout'lardan. Bu, owner'ın Mandatory Analysis #4 ve #10
maddelerini empirik olarak doğrular: yöntem güvenli ve canonical'dır, TEK koşulu
anchor'ların gerçek kronolojik sırayla ziyaret edilmesidir (§7.2).

**Şema parmak izi (rehearsal DB, tüm 4 migration sonrası):**
- `PasswordResetToken_tenantId_userId_fkey` FOREIGN KEY `("tenantId","userId")` → `User("tenantId","id")` ✓
- `PasswordResetToken_one_unresolved_per_user` UNIQUE `("tenantId","userId") WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL` ✓
- `ClientPortalUser.tokenVersion` `integer NOT NULL DEFAULT 0` ✓
- `LegalApplicationBatch.snapshotHash`/`.minorUnit` + CHECK constraints (`snapshot_hash_check`, `minor_unit_check`, ...) ✓
- `User_tenantId_id_key` UNIQUE `("tenantId","id")` ✓

### 7.5 Backup + restore-test kanıtı

Gerçek `hukuk_db`'nin fresh `pg_dump -Fc` yedeği alındı (host'a kopyalandı,
container-içi geçici dosya silindi), SHA-256 hesaplandı, ardından **disposable**
bir Postgres'e (`postgres:16-alpine`, geçici, iş bitince imha edildi) `pg_restore`
ile geri yüklendi:

- Yedek boyutu: ~900 KB (custom-format, `-Fc`).
- SHA-256: `985da5bf0f39c158c123f4cbbc824d0fc469766ec5aaf328e955ed3eb47439b3`
- Restore başarıyla tamamlandı; **seçilmiş kritik invariant'lar ve row-count
  kontrolleri** kaynakla eşleşti: `Tenant` 3, `User` 7, `ClientPortalUser` 3,
  en son uygulanmış migration `20260720184418_office_auth_p01_token_version`
  (kaynakla aynı). **Bu, database-wide tam eşdeğerlik İDDİASI DEĞİLDİR** — dört
  tablonun satır sayısı + bir metadata alanı kontrol edildi, 167+ tablonun
  tamamının sayımı, şema parmak izi karşılaştırması veya deterministik veri
  checksum'ı ALINMADI. Tam eşdeğerlik iddiası için bunlar ayrıca gerekir.

Bu, gerçek GO-MIGRATE gate'lerinden HERHANGİ biri ateşlendiğinde kullanılacak
backup+restore mekanizmasının çalıştığını kanıtlar. Her gate kendi anındaki fresh
bir yedek almalıdır (bu yedek yalnız mekanizma kanıtıdır, gate'lerin kendi
yedeklerinin yerine GEÇMEZ).

### 7.6 Gerçek `hukuk_db` salt-okuma precheck sonuçları

| Kontrol | Sonuç |
|---|---|
| `LegalApplicationBatch` satır sayısı | 0 (M2'nin fail-closed guard'ı TETİKLENMEZ) |
| `LegalApplication` satır sayısı | 0 |
| `ApplicationAttribution` satır sayısı | 0 |
| `PasswordResetToken` tablosu | YOK (M1 hiç uygulanmamış) |
| `ClientPortalUser.tokenVersion` kolonu | YOK (M4 hiç uygulanmamış) |
| `User` satır sayısı | 7 |
| `ClientPortalUser` satır sayısı | 3 |
| En son uygulanmış migration | `20260720184418_office_auth_p01_token_version` |

### 7.7 Post-migration schema-fingerprint + domain-smoke planı (her gate kendi icrasında çalıştırır)

- **GATE M2:** `\d "LegalApplicationBatch"` + `\d "LegalApplication"` ile yeni
  kolon/CHECK/trigger'ların varlığı doğrulanır; üç hedef tablonun HÂLÂ boş
  olduğu (migration veri yazmaz) teyit edilir; API sağlıklı başlar (şema
  uyuşmazlığı nedeniyle crash YOK).
- **GATE M1:** `\d "PasswordResetToken"` ile tablo + tekli FK doğrulanır; API
  sağlıklı başlar; mevcut login akışı (tokenVersion revocation dahil) değişmeden
  çalışır. Reset-token/SMTP fonksiyonel testi bu gate'te YAPILMAZ (flag zaten
  code-level false).
- **GATE M3:** composite FK + partial unique index §7.4'teki tam şekilde
  doğrulanır (bu repo'daki HARDENING-R01 PR'ının kendi post-migration
  validation'ıyla birebir).
- **GATE M4:** `\d "ClientPortalUser"` ile `tokenVersion` kolonu + `DEFAULT 0`
  doğrulanır; mevcut 3 portal kullanıcısının `tokenVersion=0` ile göründüğü
  teyit edilir; API sağlıklı başlar.

Hiçbir gate'te feature flag açma, SMTP/canlı reset-token testi veya governance
closure YOKTUR (owner PROHIBITED listesiyle tutarlı).

### 7.8 STOP / partial-success recovery prosedürü

**Düzeltme notu:** bu alt bölümün ilk taslağı "Prisma her migration.sql'i KENDİ
transaction'ında uygular" iddiasını DOĞRULAMADAN yazmıştı — owner haklı olarak
bunu işaretledi (Prisma'nın migration dosyasını varsayılan olarak transaction'a
sarmadığı, transaction isteniyorsa dosyanın kendisine açık `BEGIN`/`COMMIT`
eklenmesi gerektiği genel bir teknik referansla belirtildi). Bu iddiayı
disposable Postgres'te AYRICA, üç bağımsız testle empirik olarak doğruladım:

1. Jenerik bir bare (BEGIN/COMMIT'siz) çok-statement'lı test migration'ı: geçerli
   ilk iki statement + kasıtlı bozuk üçüncü statement.
2. **M1'in gerçek migration.sql içeriğinin BİREBİR KOPYASI** (yalnız kasıtlı bir
   bozuk statement CREATE TABLE ile CREATE UNIQUE INDEX arasına eklendi; `diff`
   ile doğrulandı — tek fark enjekte edilen 2 satır).
3. **M3'ün gerçek migration.sql içeriğinin BİREBİR KOPYASI** (aynı yöntem, DROP
   CONSTRAINT + CREATE UNIQUE INDEX'ten sonra, AddForeignKey'den önce).

**Empirik sonuç (üçünde de aynı):** `prisma migrate deploy` (v5.22.0, Postgres
16, bu repo'nun gerçek stack'i) bir migration.sql'in İÇİNDE AÇIK BEGIN/COMMIT
OLMASA BİLE, dosyayı TEK ATOMİK BİRİM olarak uyguluyor. M1-kopyası testinde
`CREATE TABLE "PasswordResetToken"` (geçerli, hatadan ÖNCE) statement'i sonraki
statement başarısız olunca KALICI OLMADI; M3-kopyası testinde `DROP CONSTRAINT`
+ `CREATE UNIQUE INDEX` (ikisi de geçerli, hatadan önce) AYNI ŞEKİLDE geri alındı.
Her üç testte de `_prisma_migrations.applied_steps_count = 0` ve
`finished_at = NULL` kaydedildi — Prisma'nın schema-engine'i (`apply_script`)
başarısız bir migration'ı sıfır-adım-uygulanmış olarak işaretliyor, statement
bazında değil.

**Bu bulgunun statüsü:** version/engine'e özgü empirik bir gözlemdir, Prisma'nın
genel/eternal bir garantisi olarak İDDİA EDİLMEZ — farklı bir Prisma/Postgres
sürümünde farklı davranabilir ve gelecekte yeniden doğrulanmalıdır. Owner'ın
genel teknik referansıyla (Prisma dokümantasyonu/blog) yüzeysel bir çelişki gibi
görünse de, bu repo'nun GERÇEK ve GÜNCEL stack'inde (5.22.0/Postgres 16),
gerçek M1 ve M3 içeriğiyle, tekrarlanabilir biçimde doğrulanmıştır.

**Recovery prosedürü (owner'ın önerdiği ihtiyatlı çerçeveye göre, empirik bulgu
IŞIĞINDA ama ona KÖRÜ KÖRÜNE güvenmeden):**

- Herhangi bir gate başarısız olursa: **DUR.** `migrate resolve`, manuel DDL veya
  dosya değişikliği YAPMA (owner PROHIBITED).
- DB ve `_prisma_migrations` durumunu SALT-OKUNUR kaydet (`prisma migrate status`
  + başarısız migration'ın `_prisma_migrations` satırı + hedef tablo/kolonların
  fiilen var olup olmadığının doğrudan SQL kontrolü — empirik bulguya göre
  BEKLENEN sonuç "hiçbiri kalıcı olmadı" ama HER gate'te AYRICA doğrulanmalı,
  varsayılmamalıdır).
- Canlı servisleri tekrar yazmaya AÇMA.
- Owner'a raporla; önceki (başarılı) gate'lerin DDL'sine dokunma veya geri alma
  girişiminde bulunma — her biri bağımsız/additive olduğu için (M3→M1 dışında
  cross-dependency yok) zaten kendi başına tutarlı bir durumdur.
- Gate öncesi doğrulanmış full backup'tan tam restore, yalnız ayrı bir owner
  kararıyla yapılır (bu register'ın kendisi bu kararı ÜRETMEZ).
- Yeniden deneme, yalnız başarısız olan SPESİFİK gate için, kök neden giderildikten
  sonra ve yalnız o gate'in kendi owner'ının onayıyla yapılır.

### 7.9 BLOCKER / READY verdict

```text
CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01:
GO-ANALYZE + GO-DOCS COMPLETE / COORDINATION REPORT DELIVERED

LIVE DB MUTATION PERFORMED AT R01 ANALYSIS TIME: 0
HISTORICAL STATUS: SUPERSEDED — §8 (M2) ve §9 (M1/M3/M4 + train kapanışı)
live-apply kayıtlarıyla; dört gate de uygulanmıştır

READY FOR OWNER GATE AUTHORIZATION (her biri AYRI, KESİN SIRAYLA — Seçenek A):
GATE M2 (LEGAL APPLICATION) — READY, ZORUNLU İLK icra (gerçek kronolojik sıra)
GATE M1 (OFFICE baseline)   — READY, YALNIZ GATE M2 sonrası (Seçenek A sırası)
GATE M3 (OFFICE hardening)  — READY, YALNIZ GATE M1 sonrası (zorunlu şema bağımlılığı)
GATE M4 (CLIENT P2-U02)     — READY, YALNIZ GATE M2+M1+M3'ün ÜÇÜ DE uygulanmışsa
                              (şema-bağımsız ama SHA-anchored icra sırası bakımından
                              BAĞIMSIZ DEĞİL — anchor'ı M3'ün doğrudan descendant'ı)

IMPLEMENTATION AUTHORITY: NONE — hiçbir gate bu raporla yetkilendirilmemiştir.
Her gate kendi ayrı OWNER GO-MIGRATE brief'ini bekler (bkz. §7.10).
```

### 7.10 Kopyala-yapıştır GO-MIGRATE brief şablonları (her biri ayrı owner yetkisi bekler)

Aşağıdaki 4 şablon, ilgili owner tarafından AYNEN veya düzenlenerek geri
gönderildiğinde ilgili gate'in canlı icrasını başlatabilir. Hiçbiri bu raporla
kendiliğinden yetkilendirilmiş DEĞİLDİR.

**GATE M2 — OWNER GO-MIGRATE — LEGAL-APPLICATION-WRITER-EVIDENCE**
```text
OWNER GO-MIGRATE — LEGAL-APPLICATION-WRITER-EVIDENCE
AUTHORITY BASIS: PR #1470, merge SHA 9dabe8dbddecafad49dbe58958ef2c3642d14a01
TARGET MIGRATION: 20260721002219_legal_application_writer_evidence
ANCHOR: isolated worktree pinned to 9dabe8dbddecafad49dbe58958ef2c3642d14a01
PREFLIGHT: fresh backup + restore-verify; confirm LegalApplicationBatch/
  LegalApplication/ApplicationAttribution row counts (must be 0 or migration
  fail-closes by design); disposable rehearsal from this exact anchor.
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: schema fingerprint per §7.7; API health smoke.
PROHIBITED: feature flag changes, live writer wiring, data backfill.
```

**GATE M1 — OWNER GO-MIGRATE — OFFICE-AUTH-P02 BASELINE MIGRATION**
```text
OWNER GO-MIGRATE — OFFICE-AUTH-P02 BASELINE MIGRATION
AUTHORITY BASIS: PR #1481, merge SHA 7676d8514292f03914f1f46c0c67041f04489194
TARGET MIGRATION: 20260720225814_office_auth_p02_password_reset_token
PRECONDITION: GATE M2 already applied (see §7.2 Option A) — otherwise this
  gate's deploy will also silently apply M2.
ANCHOR: isolated worktree pinned to 7676d8514292f03914f1f46c0c67041f04489194
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor
  (on top of a disposable DB that already has M2 applied).
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: PasswordResetToken table + single FK exist; API health +
  login-flow smoke. NO reset-token/SMTP functional test (flag remains false).
PROHIBITED: OFFICE_PASSWORD_RECOVERY_ENABLED=true, SMTP/live reset-token test.
```

**GATE M3 — OWNER GO-MIGRATE — OFFICE-AUTH-P02-HARDENING-R01**
```text
OWNER GO-MIGRATE — OFFICE-AUTH-P02-HARDENING-R01
AUTHORITY BASIS: PR #1494, merge SHA b9916f5bfe9a27e483d779e5c98d31828552f92e
TARGET MIGRATION: 20260721010000_office_auth_p02_hardening_r01_composite_fk
PRECONDITION: GATE M1 already applied (hard technical dependency).
ANCHOR: isolated worktree pinned to b9916f5bfe9a27e483d779e5c98d31828552f92e
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor
  (on top of a disposable DB that already has M2+M1 applied).
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: composite FK + partial unique index per §7.4; API health smoke.
PROHIBITED: OFFICE_PASSWORD_RECOVERY_ENABLED=true, SMTP/live reset-token test,
  GO-OPERATE, governance closure.
```

**GATE M4 — OWNER GO-MIGRATE — CLIENT-P2-U02 PORTAL USER TOKEN VERSION**
```text
OWNER GO-MIGRATE — CLIENT-P2-U02 PORTAL USER TOKEN VERSION
AUTHORITY BASIS: PR #1493, merge SHA 289068f17319c58400d3ce80770f23612b50eaa3
TARGET MIGRATION: 20260721063256_client_p2_u02_portal_user_token_version
PRECONDITION: GATE M2 + GATE M1 + GATE M3 already applied (hard SHA-anchored
  deploy-order dependency — this anchor's tree contains all three prior
  migrations, NOT an independent/any-point gate).
ANCHOR: isolated worktree pinned to 289068f17319c58400d3ce80770f23612b50eaa3
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor
  (on top of a disposable DB that already has M2+M1+M3 applied).
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: ClientPortalUser.tokenVersion column + default per §7.7;
  API health smoke; existing 3 portal users show tokenVersion=0.
PROHIBITED: portal session-revocation functional/live testing, governance closure.
```

## 8. M2 live-apply execution result — 2026-07-22

Bu bölüm §7'deki preflight/coordination geçmişini silmez. §7.9'daki sıfır-mutation
ifadesi R01 analiz anının tarihsel durumudur ve yalnız M2 bakımından aşağıdaki fiilî
owner-authorized execution kaydıyla superseded'dır.

```text
GATE:
M2 — LEGAL-APPLICATION-WRITER-EVIDENCE

MIGRATION:
20260721002219_legal_application_writer_evidence

EXECUTION ANCHOR:
9dabe8dbddecafad49dbe58958ef2c3642d14a01

LIVE DB APPLY:
SUCCESSFULLY APPLIED / POST-VALIDATED

DATA / BACKFILL:
NONE

TARGET TABLE ROW COUNTS:
LegalApplicationBatch = 0
LegalApplication = 0
ApplicationAttribution = 0

RUNTIME WRITER:
NOT IMPLEMENTED / NOT ACTIVATED
```

M2'nin uygulanmış olması yalnız physical evidence-schema foundation'ını hazırlar. ACT-28,
REC-AUTH-011 ve REC-AUTH-012 `OPEN` kalır; snapshot producer, plan builder, writer, replay,
consumer cutover, legacy retirement, M1/M3/M4 veya başka migration yetkisi üretmez. Exact-cent
invariant'ı şöyledir:

```text
receiptAmountMinor = SUM(appliedAmountMinor) + heldRemainderMinor
```

## 9. M1/M3/M4 live-apply + train drain — governance kapanış kaydı (2026-07-22, REGULARIZE)

Bu bölüm, `CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01-CLOSE-GOV` görevi kapsamında
**REGULARIZE** protokolüyle yazılmıştır: M1/M3/M4 gate icraları 2026-07-21 (UTC)
tarihinde gerçekleşmiş ancak bu register'a eş zamanlı işlenmemişti. Bu kayıt,
icra sonuçlarını canlı `hukuk_db` üzerinde 2026-07-22 tarihinde çalıştırılan
**salt-okuma** sorgulardan (record-of-fact) türetir; bu kayıt sırasında canlı
DB'de HİÇBİR mutation yapılmamıştır.

### 9.1 `_prisma_migrations` icra kanıtı (VERIFIED, salt-okuma, 2026-07-22)

| Gate | Migration | started_at (UTC) | finished_at (UTC) | applied_steps_count |
|---|---|---|---|---|
| M2 | `20260721002219_legal_application_writer_evidence` | 2026-07-21 21:08:44 | 2026-07-21 21:08:44 | 1 |
| M1 | `20260720225814_office_auth_p02_password_reset_token` | 2026-07-21 22:02:36 | 2026-07-21 22:02:36 | 1 |
| M3 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | 2026-07-21 22:26:32 | 2026-07-21 22:26:32 | 1 |
| M4 | `20260721063256_client_p2_u02_portal_user_token_version` | 2026-07-21 23:24:13 | 2026-07-21 23:24:13 | 1 |

**Gerçekleşen icra sırası, §7.2'deki zorunlu tek sırayla (Seçenek A: M2 → M1 →
M3 → M4) BİREBİR aynıdır.** `_prisma_migrations` tablosunda `finished_at IS NULL`
veya `rolled_back_at IS NOT NULL` satır sayısı 0'dır (başarısız/yarım/geri
alınmış migration yok).

### 9.2 Şema parmak izi doğrulaması (VERIFIED, salt-okuma, 2026-07-22)

| Gate | Kontrol | Sonuç |
|---|---|---|
| M1 | `to_regclass('public."PasswordResetToken"')` | tablo VAR |
| M3 | `PasswordResetToken_tenantId_userId_fkey` composite FK | VAR (1) |
| M3 | `PasswordResetToken_one_unresolved_per_user` partial unique index | VAR (1) |
| M4 | `ClientPortalUser.tokenVersion` | `NOT NULL DEFAULT 0` |
| M4 | Mevcut portal kullanıcıları `tokenVersion=0` | 3/3 |

M2'nin kendi post-validation kaydı §8'dedir (hedef tablolar 0 satır, backfill yok).

### 9.3 Kayıt sınırları (dürüstlük beyanı)

- Bu bölümdeki kanıtlar yalnız canlı DB'den bugün türetilebilenlerdir. M1/M3/M4
  icra oturumlarının kendi session-level detayları (her gate'in fresh backup
  SHA-256'sı, anchor checkout kanıtı, icra anındaki post-validation çıktıları)
  bu register'a eş zamanlı yazılmamıştır ve burada RETROAKTİF olarak İCAT
  EDİLMEZ — `UNRECORDED` statüsündedir. `_prisma_migrations` checksum'ları
  migration içeriğini canonical dosyalara bağladığı için uygulanan DDL'in
  kimliği yine de VERIFIED'dır.
- 2026-07-22 salt-okuma kontrolünde en son uygulanmış migration
  `20260721210134_of01_history_p01_service_occurrence`'tır (DEBTOR OF01 —
  ayrı workstream, kendi governance kaydı kendi hattında). Bu register'ın
  2026-07-21'de tespit ettiği 4-migration kuyruğu bakımından pending migration
  KALMAMIŞTIR.

### 9.4 Disposition güncellemeleri

- §2 tespiti, §3 owner suspend kararı ve §4 workstream disposition tablosu
  TARİHSEL kayıtlardır; bu bölümle superseded'dırlar.
- OFFICE'in `SUSPENDED / BLOCKED AT PREFLIGHT` durumu **RESOLVED**'dır (M1+M3
  applied). §3'teki DO-NOT listesi bu train'e özgüydü ve train'in
  tamamlanmasıyla tüketilmiştir; gelecekteki her migration kuyruğu kendi owner
  kararlarını gerektirir.
- Bu kayıt hiçbir yeni migration, feature-flag, GO-OPERATE veya runtime
  aktivasyon yetkisi ÜRETMEZ. `OFFICE_PASSWORD_RECOVERY_ENABLED` code-level
  false kalır; OFFICE-AUTH-P02 runtime aktivasyonu, CLIENT-P2-U02 revocation
  fonksiyonel testi ve LEGAL APPLICATION runtime writer'ı kendi
  workstream'lerinin ayrı owner GO'larını bekler.
- Register `LIVING / NON-NORMATIVE COORDINATION SURFACE` olarak AÇIK kalır:
  gelecekte gerçek `hukuk_db`'de yeni bir çok-workstream'li pending-migration
  kuyruğu tespit edilirse yeni bölüm burada açılır.

### 9.5 Kapanış verdict'i

```text
CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01:
CLOSED — 4/4 GATE APPLIED (M2→M1→M3→M4, zorunlu sırayla) / QUEUE DRAINED /
GOVERNANCE RECONCILED (REGULARIZE, salt-okuma DB kanıtıyla)

IMPLEMENTATION AUTHORITY: NONE — bu kapanış kaydı hiçbir yeni yetki üretmez.
```

## 10. UYAP-OPERATION-ATTEMPT-SCHEMA-FOUNDATION-P05A-R1 — yeni pending migration (2026-07-22)

Bu bölüm, F4-b/P-E5A-R1 (UYAP CONNECTOR) kapsamında **üretilmiş ancak canlı
`hukuk_db`'ye HİÇ uygulanmamış** yeni bir migration'ı cross-workstream görünür
kılar. §7-9'daki train ile ilişkisi YOKTUR (o kuyruk DRAINED); bu ayrı, tek
migration'lık yeni bir pending giriştir. Bu kayıt canlı DB mutation'ı İÇERMEZ.

### 10.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260722170000_uyap_operation_attempt_schema_foundation_r1` |
| Domain | UYAP CONNECTOR (F4-b / P-E5A-R1) |
| Authority basis | GO-IMPLEMENT — UYAP-OPERATION-ATTEMPT-SCHEMA-FOUNDATION-P05A-R1 |
| İçerik | ADDITIVE-ONLY: 3 yeni enum (`UyapInternalOperationState`/`UyapProviderState`/`UyapLegalEffectState`), 2 yeni tablo (`UyapOperation`/`UyapAttempt`), 10 tenant-safe composite FK, 4 structural CHECK, yeni index + 4 parent (`User`/`Client`/`Case`/`Lawyer`) `@@unique([id, tenantId])` |
| Legacy etkisi | `UyapRequestLog`/`CpeDecisionLog`/`CpeExecutionRecord` DEĞİŞMEZ; hiçbir UPDATE/INSERT/DELETE/DROP/TRUNCATE veya backfill YOK |
| Doğrulama | Disposable `postgres:16` üzerinde `prisma migrate deploy` + 9 static + 18 db-gated test PASS; blocking CI 2 step (static+additive guard / disposable-DB acceptance) |
| **LIVE DB APPLY** | **NOT APPLIED** — gerçek `hukuk_db`'ye uygulanmadı |
| **GO-MIGRATE** | **REQUIRED / NOT AUTHORIZED** — ayrı owner GO-MIGRATE brief'i bekler |

### 10.2 Disposition

- IMPLEMENTATION AUTHORITY: schema + migration + test + CI **CANONICAL**; live-apply
  ve runtime wiring **NONE**. Bu migration merge edilmiş/CI-geçmiş olsa bile canlıya
  hiç uygulanmamış olarak KALIR; `prisma migrate deploy` DAİMA tüm pending
  migration'ları uygular, dolayısıyla bu giriş başka bir workstream'in GO-MIGRATE
  penceresinde istemeden canlıya taşınabilir — o yüzden burada görünür kılınır.
- CPE-link (`UyapAttemptCpeDecisionLink`) ve CPE-evaluation enum'ları bu migration'da
  YOKTUR; P-E5C'ye ertelenmiştir (CpeDecisionLog'un `tenantId` kolonu olmadığından
  tenant-safe composite FK additive olarak eklenemez — Policy Engine tenant-plane ön
  koşulu bekler).
- Sonraki adım: ayrı OWNER GO-MIGRATE brief'i (aşağıdaki şablon). Bu register
  şablonu SEÇMEZ/yetkilendirmez.

**GATE UYAP-P05A-R1 — OWNER GO-MIGRATE — UYAP OPERATION/ATTEMPT SCHEMA FOUNDATION**
```text
OWNER GO-MIGRATE — UYAP-OPERATION-ATTEMPT-SCHEMA-FOUNDATION-P05A-R1
AUTHORITY BASIS: P-E5A-R1 GO-IMPLEMENT merge SHA (PR merge sonrası doldurulur)
TARGET MIGRATION: 20260722170000_uyap_operation_attempt_schema_foundation_r1
ANCHOR: isolated worktree pinned to the P-E5A-R1 merge SHA
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor;
  confirm UyapOperation/UyapAttempt tabloları canlı DB'de YOK.
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: 2 tablo + 3 enum + 10 composite FK + 4 CHECK + parent unique
  index'ler; UyapRequestLog/CpeDecisionLog DEĞİŞMEMİŞ; API health smoke.
PROHIBITED: runtime writer/service wiring, CPE-link, data backfill, GO-OPERATE,
  governance closure beyond schema foundation.
```
