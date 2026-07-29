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
| **LIVE DB APPLY** | **APPLIED — TRAIN-R02, 2026-07-23, exec SHA `b3b0fa5b8183`** (bkz. §16) |
| **GO-MIGRATE** | **CONSUMED — owner ratified M1-M8, TRAIN-R02** (bkz. §16) |

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

## 11. POLICY-CPE-DECISION-COMPOSITE-KEY-P05C-P01 — yeni pending migration (2026-07-23)

Policy Engine bounded-context'ine ait **additive-only tek index** migration'ı; üretildi ancak
canlı `hukuk_db`'ye **hiç uygulanmadı**. §7-9 train'den ve §10 girişinden bağımsız, ayrı bir
pending giriştir. Bu kayıt canlı DB mutation'ı İÇERMEZ.

### 11.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260722230000_cpe_decision_composite_reference_key` |
| Domain | **POLICY ENGINE** (CpeDecisionLog sahibi) — tüketici: UYAP F4-b/P-E5C |
| Authority basis | GO-IMPLEMENT — POLICY-CPE-DECISION-COMPOSITE-KEY-P05C-P01 |
| İçerik | **TEK statement**: `CREATE UNIQUE INDEX "CpeDecisionLog_id_caseId_key" ON "CpeDecisionLog"("id","caseId")` |
| Amaç | CpeDecisionLog'u gelecekteki tenant-safe UYAP evidence linkage için **composite FK hedefi** yapmak (P-E5C-R0 seçenek O2′) |
| Kolon / veri | **tenantId kolonu YOK · backfill YOK · DML YOK · link tablosu YOK · write-path değişmedi** |
| Veri riski | **YOK** — `id` zaten PK olduğundan `(id, caseId)` süper-küme anahtardır; hiçbir veri durumu kısıtı ihlal edemez, index teklik nedeniyle kurulamama durumuna düşemez |
| Doğrulama | 11 static + 7 db-gated PASS (disposable `postgres:16`); blocking CI 2 step |
| **LIVE DB APPLY** | **APPLIED — TRAIN-R02, 2026-07-23, exec SHA `b3b0fa5b8183`** (bkz. §16) |
| **GO-MIGRATE** | **CONSUMED — owner ratified M1-M8, TRAIN-R02** (bkz. §16) |

### 11.2 Disposition

- IMPLEMENTATION AUTHORITY: schema + migration + test + CI **CANONICAL**; live-apply ve
  P-E5C link tablosu/runtime linkage **NONE** (ayrı owner GO).
- Bu giriş `prisma migrate deploy`'un sıralı-toplu davranışı nedeniyle başka bir
  workstream'in GO-MIGRATE penceresinde istemeden canlıya taşınabilir; §10 girişiyle
  birlikte kuyrukta **2 pending migration** bulunduğu burada görünür kılınır.
- Operasyonel not: veri riski olmasa da `CREATE UNIQUE INDEX` (non-CONCURRENT) hedef tablo
  üzerinde yazma kilidi alır; canlı pencerede satır sayısına bağlı kısa bir kilit süresi
  beklenir. Satır sayısı bu kayıtta **UNKNOWN** (analiz salt-okuma yapıldı, canlı DB'ye
  bakılmadı) — GO-MIGRATE preflight'inde ölçülmelidir.

**GATE P05C-P01 — OWNER GO-MIGRATE — CPE DECISION COMPOSITE REFERENCE KEY**
```text
OWNER GO-MIGRATE — POLICY-CPE-DECISION-COMPOSITE-KEY-P05C-P01
AUTHORITY BASIS: P05C-P01 GO-IMPLEMENT merge SHA (PR merge sonrası doldurulur)
TARGET MIGRATION: 20260722230000_cpe_decision_composite_reference_key
ANCHOR: isolated worktree pinned to the P05C-P01 merge SHA
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor;
  CpeDecisionLog satır sayısını ölç (index kilit süresi tahmini için).
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: CpeDecisionLog_id_caseId_key UNIQUE index mevcut; PK + caseId FK
  korunmuş; tenantId kolonu YOK; satır sayısı değişmemiş; API health smoke.
PROHIBITED: UyapAttemptCpeDecisionLink, runtime linkage, tenantId kolonu,
  backfill, CpeExecutionRecord değişikliği, governance closure beyond this index.
```

## 12. UYAP-ATTEMPT-CPE-DECISION-LINK-P05C-P02 — yeni pending migration (2026-07-23)

Link schema foundation + Policy Engine referential legal-hold. Üretildi, canlı `hukuk_db`'ye
**hiç uygulanmadı**. §10 ve §11'den bağımsız üçüncü pending giriştir. Canlı DB mutation YOK.

### 12.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260723010000_uyap_attempt_cpe_decision_link` |
| Domain | UYAP (link tablosu) + POLICY ENGINE (retention filtresi, kod tarafı) |
| Authority basis | GO-IMPLEMENT — UYAP-ATTEMPT-CPE-DECISION-LINK-P05C-P02 |
| İçerik | 1 `CREATE TABLE "UyapAttemptCpeDecisionLink"` + 4 index + 2 unique index (`cpeDecisionLogId`, `UyapOperation(id,caseId,tenantId)`) + **3 FK, üçü de ON DELETE RESTRICT** |
| Kardinalite | 1 attempt → N karar; aynı kararın başka attempt'e bağlanması **DB'de reddedilir** (UYAP-CONST-002) |
| Kolon / veri | `role`/`disposition` YOK · `CpeDecisionLog.tenantId` YOK · backfill/DML YOK · `CpeExecutionRecord` değişmedi |
| Veri riski | **YOK** — yeni tablo boş oluşturulur; `UyapOperation` unique'i `id` PK süper-kümesi olduğundan ihlal edilemez |
| Doğrulama | 18 static + 12 db-gated + uyarlanan 10 kvkk testi PASS (disposable `postgres:16`); blocking CI 2 step |
| **LIVE DB APPLY** | **APPLIED — TRAIN-R02, 2026-07-23, exec SHA `b3b0fa5b8183`** (bkz. §16) |
| **GO-MIGRATE** | **CONSUMED — owner ratified M1-M8, TRAIN-R02** (bkz. §16) |

### 12.2 Disposition

- Link tablosu **DORMANT**: yazan üretim kodu YOK (CI grep guard'ı ile korunuyor); runtime
  linkage **ayrı owner GO** gerektirir.
- Retention davranışı değişti (kod tarafı, migration değil): `DecisionLogRetentionService`
  artık yalnız **linklenmemiş** ve cutoff'tan eski kararları siler. Genel 90 günlük süre
  DEĞİŞMEDİ; bu süresiz saklama kararı DEĞİLDİR — link kalkarsa kayıt normal rejime döner.
  `ON DELETE RESTRICT` yalnız son savunma hattıdır; asıl filtre retention sorgusundadır.
- Kuyrukta artık **3 pending migration** var (§10, §11, §12). `prisma migrate deploy` daima
  tümünü uygular — herhangi bir workstream'in GO-MIGRATE penceresi diğerlerini de taşır.
  **Sıralama bağımlılığı:** §12, §11'in ürettiği `CpeDecisionLog(id, caseId)` unique'ine FK ile
  bağımlıdır; §11 uygulanmadan §12 uygulanamaz (doğal migration sırası bunu zaten sağlar).

**GATE P05C-P02 — OWNER GO-MIGRATE — UYAP ATTEMPT/CPE DECISION LINK**
```text
OWNER GO-MIGRATE — UYAP-ATTEMPT-CPE-DECISION-LINK-P05C-P02
AUTHORITY BASIS: P05C-P02 GO-IMPLEMENT merge SHA (PR merge sonrası doldurulur)
TARGET MIGRATION: 20260723010000_uyap_attempt_cpe_decision_link
PRECONDITION: §11 (20260722230000_cpe_decision_composite_reference_key) uygulanmış olmalı.
ANCHOR: isolated worktree pinned to the P05C-P02 merge SHA
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor.
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: link tablosu + 3 FK (confdeltype='r') + @@unique([cpeDecisionLogId]) +
  UyapOperation_id_caseId_tenantId_key mevcut; tablo BOŞ; CpeDecisionLog kolonları değişmemiş.
PROHIBITED: link writer/runtime linkage, role/disposition, backfill, retention süresinin
  genel değişimi, gerçek archive tablosu, P-E5D/P-E5E/P-E6.
```

## 13. RCV-CLAIM-FORM-P02-S08-I02A — yeni pending migration (2026-07-23)

Receivable / Claim Formation bounded-context'ine ait additive intent/snapshot foundation
migration'ı merge edilmiş, ancak canlı `hukuk_db`ye uygulanmamıştır. Bu bölüm I02A formal
closure'ın normatif olmayan coordination referansıdır; canlı DB mutation'ı, GO-MIGRATE veya
runtime activation yetkisi içermez.

### 13.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260723100000_claim_formation_intent_snapshot_foundation` |
| Domain | RECEIVABLE / CLAIM FORMATION |
| Authority basis | RCV-CLAIM-FORM-P02-S08-I02A implementation PR #1541 / squash `3ba17a0a8cf1210afc38613943c83d7c1a6efe49` |
| İçerik | Additive `ClaimItemFormationIntent` + `ClaimFormationSnapshot` physical foundation |
| Historical data | Backfill/mutation `NONE`; existing rows unchanged |
| Doğrulama | Disposable PostgreSQL 98 migrations clean deploy; foundation `18/18`; ClaimItem regression `267/267`; required CI `4/4 PASS` |
| **LIVE DB APPLY** | **APPLIED — TRAIN-R02, 2026-07-23, exec SHA `b3b0fa5b8183`** (bkz. §16) |
| **GO-MIGRATE** | **CONSUMED — owner ratified M1-M8, TRAIN-R02** (bkz. §16) |

### 13.2 Disposition

- Schema + migration + test technical foundation canonical main'dedir; production writer,
  runtime activation, typed intent/admission, OfficeApproval binding ve ClaimItem/snapshot
  production finalizer `NONE / NOT AUTHORIZED`dır.
- S08-I01 fail-closed containment `ACTIVE / UNCHANGED`; Claim Formation runtime
  `PARTIAL — THROUGH S08-I01 ONLY`dır.
- I02A migration'ı §10, §11 ve §12 ile birlikte güncel pending queue'da görünür tutulur. Prisma'nın
  sıralı-toplu deploy davranışı nedeniyle herhangi bir live-apply penceresi bütün pending
  migration'lar için fresh status ve ilgili owner yetkilerini birlikte doğrulamalıdır.
- Bu kayıt S08-I02B, S08-I03 veya S08-I04 authority'si; historical inventory/backfill;
  Collection/shared-boundary değişikliği veya successor task seçimi üretmez.

## 14. OFFICE-PHASE2-CAP09A-FOUNDATION-I01 — yeni pending migration (2026-07-23)

Bu bölüm, OFFICE Phase 2 / CAP-09 Audit-Attribution Standard kapsamında **üretilmiş ancak
canlı `hukuk_db`'ye HİÇ uygulanmamış** bir migration'ı cross-workstream görünür kılar.
§10-13'ten bağımsız, ayrı bir pending giriştir. Bu kayıt canlı DB mutation'ı İÇERMEZ.
Bu giriş CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02 (§15) analizi sırasında eklenmiştir —
migration merge edildiğinde (2026-07-23) bu register'a hiç işlenmemiş olduğu tespit edildi.

### 14.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260722213239_office_phase2_cap09a_foundation_audit_attribution` |
| Domain | OFFICE Phase 2, W-P2-α / CAP-09A (Audit Attribution Foundation, SLICE 2/3) |
| Authority basis | PR #1536, squash `580edd8efb10c92de45f6c94bc0f6ca7c388df43`, merged 2026-07-23T01:48:40+03:00 |
| İçerik | ADDITIVE-ONLY: `AuditLog` tablosuna 7 nullable TEXT kolon (`actorType`/`correlationId`/`decisionResult`/`policyRef`/`policyVersion`/`reasonCode`/`requestId`). Index/enum/FK/trigger YOK. |
| Kolon / veri | Backfill/DML YOK; mevcut satırlar 7 yeni kolonda NULL alır |
| Veri riski | **YOK** — nullable, default yok, hiçbir CHECK yok |
| Doğrulama | `decision-log.md` (2026-07-22 GO-DECIDE) SLICE 1 (governance) canonik, SLICE 2 (bu migration) için "ayrı owner GO-ANALYZE + GO-IMPLEMENT bekler" diyor; PR aynı gün merge edilmiş — belgelenmiş yetki ile fiili merge arasında iz sürülebilir bir boşluk var (owner dikkatine) |
| **LIVE DB APPLY** | **APPLIED — TRAIN-R02, 2026-07-23, exec SHA `b3b0fa5b8183`** (bkz. §16) |
| **GO-MIGRATE** | **CONSUMED — owner ratified M1-M8, TRAIN-R02** (bkz. §16) |

### 14.2 Disposition

- IMPLEMENTATION AUTHORITY: schema + migration **CANONICAL** (main'de); live-apply **NONE**.
- Operasyonel not: `ALTER TABLE ADD COLUMN` (7 kolon, tek statement) `ACCESS EXCLUSIVE` alır
  ama nullable/default'suz olduğu için metadata-only hızlı yoldur; `AuditLog` canlıda 313 satır
  (TRAIN-R02 sırasında taze ölçüldü) — pratikte önemsiz sürede tamamlanır.
- Yazma tarafı **TAMAMEN DORMANT**: repo genelinde hiçbir gerçek caller yeni 7 alanı
  doldurmuyor (SLICE 3 tüketici kablolaması ayrı, henüz implement edilmemiş).
- CI KAPSAM BOŞLUĞU: bu migration'ın 2 yeni test dosyası (`audit-metadata-builder.spec.ts`,
  `audit.service.attribution.spec.ts`) `ci.yml`'de HİÇBİR `testPathPattern`'e denk gelmiyor —
  CI'da hiç çalışmıyorlar (bu repo'nun bilinen "CI narrow-allowlist stale-test-gap" deseni).
- Sonraki adım: ayrı OWNER GO-MIGRATE brief'i (aşağıdaki şablon). Bu register şablonu
  SEÇMEZ/yetkilendirmez.

**GATE CAP09A-I01 — OWNER GO-MIGRATE — OFFICE AUDIT ATTRIBUTION FOUNDATION**
```text
OWNER GO-MIGRATE — OFFICE-PHASE2-CAP09A-FOUNDATION-I01
AUTHORITY BASIS: PR #1536 merge SHA 580edd8efb10c92de45f6c94bc0f6ca7c388df43
TARGET MIGRATION: 20260722213239_office_phase2_cap09a_foundation_audit_attribution
ANCHOR: isolated worktree pinned to 580edd8efb10c92de45f6c94bc0f6ca7c388df43
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor;
  AuditLog satır sayısını ölç (taze, bu kayıttan bağımsız).
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: AuditLog 7 yeni nullable kolon mevcut; mevcut 6 index değişmemiş;
  satır sayısı değişmemiş; API health smoke.
PROHIBITED: SLICE 3 consumer wiring (StaffService.remove()), CHECK/enum/index ekleme,
  backfill, governance closure beyond this column-set.
```

## 15. CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02 — GO-ANALYZE freshness-check + tam zincir rehearsal (2026-07-23)

**Mode:** READ-ONLY MIGRATION COORDINATION (§7 ile aynı disiplin). Gerçek `hukuk_db`'de
HİÇBİR mutation yapılmadı; bu bölüm yalnız salt-okuma SQL sorguları, salt-okuma git/gh
doğrulaması ve **disposable** (izole, bu görevle imha edilen) Postgres 16 konteyneri
üzerindeki tam-zincir rehearsal kanıtını kaydeder. §10-14'ün hiçbiri bu bölümde
YENİDEN YAZILMADI — yalnız ek bulgular kaydedilir (append-only, §7→§8/§9 emsali).

### 15.1 Pending queue — tam liste (M1-M8, folder-order = Prisma apply sırası)

| # | Migration | Program | Register | GO-MIGRATE |
|---|---|---|---|---|
| M1 | `20260722170000_uyap_operation_attempt_schema_foundation_r1` | UYAP F4-b/P-E5A-R1 | §10 | NOT AUTHORIZED |
| M2 | `20260722213239_office_phase2_cap09a_foundation_audit_attribution` | OFFICE Phase 2 CAP-09A | §14 (bu görevde eklendi) | NOT AUTHORIZED |
| M3 | `20260722224901_of01_history_p04a1_r1_service_regime_code` | CORE DEBTOR OF-01 P04-A1-R1 | **YOK — bkz. 15.4** | NOT AUTHORIZED |
| M4 | `20260722230000_cpe_decision_composite_reference_key` | POLICY ENGINE P05C-P01 | §11 | NOT AUTHORIZED |
| M5 | `20260723010000_uyap_attempt_cpe_decision_link` | UYAP+POLICY ENGINE P05C-P02 | §12 | NOT AUTHORIZED |
| M6 | `20260723100000_claim_formation_intent_snapshot_foundation` | RECEIVABLE P02-S08-I02A | §13 (freshness-confirmed, doğru) | NOT AUTHORIZED |
| M7 | `20260723120000_of01_history_p04a1_r2_completion_mode_schema` | CORE DEBTOR OF-01 P04-A1-R2 (1/2) | **YOK — bkz. 15.4** | NOT AUTHORIZED |
| M8 | `20260723120100_of01_history_p04a1_r2_completion_mode_constraints` | CORE DEBTOR OF-01 P04-A1-R2 (2/2) | **YOK — bkz. 15.4** | NOT AUTHORIZED |

**Sonuç: 8/8 migration BLOCKED.** Hiçbirinin owner GO-MIGRATE yetkisi yok; disposition
tamamı için aynı: teknik hazırlık büyük ölçüde CANONICAL/hazır, canlı-apply yetkisi NONE.

### 15.2 KRİTİK BULGU — gerçek kronolojik merge sırası ≠ klasör (apply) sırası

`git log`/`git merge-base --is-ancestor` ile doğrudan doğrulandı (§7.2'nin orijinal
train'inde tespit edilen AYNI desenin, bu kez M1-M8 kuyruğunda YENİDEN gerçekleştiği
somut bir örneği):

| Migration | Klasör ts (apply sırası) | Gerçek merge zamanı |
|---|---|---|
| M3 (DEBTOR) | `224901` | 2026-07-23T03:06:47+03:00 |
| M4 (POLICY-ENGINE) | `230000` | **2026-07-23T02:20:20+03:00** ← M3'ten ÖNCE merge edildi |
| M5 (UYAP-link) | `010000` (23 Tem) | **2026-07-23T12:35:27+03:00** |
| M6 (RECEIVABLE) | `100000` (23 Tem) | **2026-07-23T03:12:59+03:00** ← M5'ten ÖNCE merge edildi |

Doğrulama: `git merge-base --is-ancestor c81bb2e4 5e2f613d` = YES (M4, M3'ün atasıdır);
`git merge-base --is-ancestor 3ba17a0a 40c1ab1e` = YES (M6, M5'in atasıdır).

**Etki:** eğer eventual GO-MIGRATE icrası her migration'ı KENDİ ilk-merge SHA'sına
anchor'layıp o checkout'ta `migrate deploy` çalıştırma yöntemini (§7.3/§7.4'ün orijinal
train'de kullandığı yöntem) kullanırsa: M3'ün anchor'ı M4'ü de sessizce içerir; M5'in
anchor'ı M6'yı da sessizce içerir. **Şema güvenliği açısından zararsız** (M3↔M4 ve
M5↔M6 arasında hiçbir ortak tablo/FK/trigger yok — ayrı ayrı doğrulandı), ama
ATTRIBUTION/YETKİ seviyesinde §7.2 ile birebir aynı risk sınıfı: "yalnız X'i onayladım"
diyen bir owner, anchor-SHA yöntemiyle istemeden Y'yi de uygulamış olabilir. Eventual
icra planı ya TAM kronolojik sırayla (M1→M2→M4→M3→M6→M5→M7/M8) anchor'lanmalı, ya da
tüm 8'i TOPLU yetkilendirip mevcut-main-tabanlı tek bir `prisma migrate deploy` (klasör
sırası, teknik olarak eşdeğer güvenli) ile uygulanmalı — ikinci durumda "ayrı onay"
yanılsaması verilmemeli, hepsi zaten aynı anda uygulanacaktır.

### 15.3 Tam zincir disposable rehearsal — EMPİRİK KANIT

Fresh disposable Postgres (`postgres:16-alpine`, geçici konteyner, port 5433, iş
bitince imha edildi), mevcut `main`'in `prisma/migrations` dizini (102 klasör, M1-M8
dahil son 8'i) üzerinden, tek bir `prisma migrate deploy` ile:

- **Sonuç: "All migrations have been successfully applied."** 102/102, 0 hata.
- `_prisma_migrations` doğrulaması: `count(*)=102`, `rolled_back_at IS NOT NULL` = 0,
  `finished_at IS NULL` = 0 (hiçbiri yarım kalmamış).
- M1→M8 sekiz migration'ın tamamı `started_at`/`finished_at` ile ayrı ayrı doğrulandı,
  hepsi milisaniyeler içinde tamamlandı (boş/küçük tablolar üzerinde, gerçek `hukuk_db`
  satır sayılarıyla tutarlı — bkz. 15.5).
- Bu, M4-önce-M5 (FK bağımlılığı) ve M3/M7-önce-M8 (enum ADD VALUE + CHECK referansı,
  ayrı transaction gerekliliği) sıralamalarının PRATİKTE hatasız çalıştığının ampirik
  kanıtıdır — herhangi bir sıralama ihlali olsaydı Postgres FK/enum hatasıyla dururdu.
- `migrate resolve`, manuel DDL veya migration dosyası değişikliği KULLANILMADI —
  yalnız plain `prisma migrate deploy`, mevcut `main` checkout'undan.
- Bu rehearsal M1-M8'i TEK toplu adımda test etti (owner'ın 15.2'de tarif edilen "toplu
  mu, anchor-sıralı mı" sorusuna doğrudan pratik cevap: toplu/klasör-sıralı çalışıyor).
  Her migration'ın KENDİ SQL dosyası ayrıca tek tek okunarak (M1-M8 hepsi) statement
  seviyesinde doğrulandı — ayrı 8 konteynerli anchor-SHA rehearsal'ı bu görevde
  YAPILMADI (gerekçe: tek-atım ampirik PASS + statement-seviyesi tam okuma, aynı
  güvenceyi daha düşük maliyetle sağladı); eventual GERÇEK GO-MIGRATE icrasında
  §7.3/§7.4 emsali per-anchor rehearsal'ın tekrarlanması ÖNERİLİR, atlanmamalıdır.

### 15.4 M3/M7/M8 (CORE DEBTOR) — register'da YENİ tespit edilen eksik kapsam

§10-13 hiçbiri DEBTOR programının kendi M3/M7/M8 migration'larını kapsamıyordu (bu
görevden önce register bunları hiç anmıyordu — DEBTOR'ın kendi ardışık migration'ları
şimdiye kadar yalnız kendi program-içi sıra sorunu sayılmıştı, artık M1-M8 kuyruğunun
GENELİ nedeniyle cross-program görünürlük gerektiriyor). Özet (detaylı sınıflandırma bu
görevin final raporunda/oturum kaydında mevcuttur, owner talebi üzerine ayrı bir §16/17/18
olarak da eklenebilir):
- M3 (`of01_history_p04a1_r1_service_regime_code`, PR #1542, `5e2f613d`): additive enum+
  kolon+CHECK; M7/M8'in DOĞRUDAN ön koşulu (enum/CHECK genişletmesi).
- M7 (`of01_history_p04a1_r2_completion_mode_schema`, PR #1548, `40a91e8d`, 1/2): 2 yeni
  enum + 3 enum ADD VALUE (M3'ün enum'una) + 2 nullable kolon.
- M8 (aynı PR/commit, 2/2): eski CHECK drop + 5 yeni CHECK + trigger genişletme; M7'ye
  transaction-sınırı nedeniyle HARD bağımlı (ADD VALUE aynı transaction'da referans
  edilemez — Postgres kısıtı).
- Üçü de BLOCKED: owner GO-MIGRATE yetkisi yok (DEBTOR-OF01-HISTORY-P04-A1-R2-CUTOVER-R01
  görevi tam da bu nedenle SUSPENDED durumdadır).

### 15.5 Taze canlı satır sayıları (bu görevde, salt-okuma, hukuk_db üzerinde ölçüldü)

| Tablo | Satır | İlgili migration |
|---|---|---|
| ServiceOccurrence | 0 | M3, M7, M8 |
| Tebligat | 0 | (P01, zaten uygulanmış) |
| AuditLog | 313 | M2 |
| CpeDecisionLog | 0 | M4, M5 (§11'in "UNKNOWN" kaydını ÇÖZER) |
| User | 7 | M1 |
| Client | 15 | M1 |
| Case | 8 | M1 |
| Lawyer | 9 | M1 |
| CaseDebtor | 7 | (bağlam) |
| ClaimItem | 6 | M6 |
| UyapAttempt (tablo) | YOK | M1 henüz uygulanmadığını doğrular |

Sonuç: 8 migration'ın dokunduğu HİÇBİR tablo üç haneli rakamı geçmiyor (AuditLog
hariç, o da 313) — tüm lock-süresi endişeleri (§10/§11/§12'de "UNKNOWN" veya
"satır sayısına bağlı" olarak işaretlenmiş olanlar dahil) bugünkü veri hacmiyle
PRATİKTE önemsizdir. Bu, GO-MIGRATE anında YİNE TAZE ölçülmelidir (bu kayıt bir
snapshot'tır, yetki değildir).

### 15.6 Sistemik discrepancy — "blocking CI" karakterizasyonu abartılı (§10/§11/§12/§13/§14'ün TAMAMINI etkiler)

Üç bağımsız alt-analiz (M4, M5, M6) birbirinden habersiz olarak AYNI bulguyu
doğruladı: `gh api repos/.../branches/main/protection` → `required_status_checks.
contexts = ["Web Tests (vitest)"]` — TEK GEREKLİ CHECK budur. `gh api .../rulesets`
→ `[]` (ruleset yok). `enforce_admins.enabled = false`. Bu migration'ların
guard'larını barındıran `test-suite` job'u ("Test Suite") GitHub tarafından
ZORUNLU KILINAN bir merge gate'i DEĞİLDİR — script seviyesinde `exit 1` yapar ve
her push/PR'da koşulsuz çalışır (bu ölçüde gerçek), ama platformun kendisi bunu
main'e merge için şart koşmaz. §10/§11/§12/§13/§14'ün "blocking CI N step" ifadesi
iş-seviyesinde doğru, platform-seviyesinde YANILTICI — owner dikkatine kaydedilir,
mevcut disposition'lar (hepsi zaten BLOCKED/NOT AUTHORIZED) DEĞİŞTİRİLMEDİ.

### 15.7 M5-özel bulgu — retention cron canlı kodu M5'i ÖNCEDEN talep ediyor

`DecisionLogRetentionService.archiveOldRecords()` (@Cron 3am, `AppModule`'de kayıtlı,
main'de CANLI kod) M5'in `uyapAttemptLinks` ilişkisini ZATEN sorguluyor. Taze
doğrulandı: RUNTIME worktree'nin pinlendiği `200fb26b` (2026-07-22T22:26:11+03:00),
M5'in merge zamanından (`40c1ab1e`, 2026-07-23T12:35:27+03:00) ÖNCE — yani RUNTIME şu an
bu koda sahip DEĞİL, risk BUGÜN aktif değil (`git merge-base --is-ancestor 40c1ab1e
200fb26b` = NO). ANCAK: RUNTIME gelecekte main HEAD'e (veya `40c1ab1e`'den sonraki
herhangi bir noktaya) çekilirse VE M5 aynı pencerede canlı DB'ye uygulanmazsa, günlük
KVKK retention/purge cron'u "relation does not exist" hatasıyla SESSİZCE (try/catch,
crash yok, log var) no-op olur. Öneri (karar değil): gelecekteki herhangi bir
RUNTIME→main-HEAD cutover'ı, M5'in DB-migration durumunu ayrıca kontrol etmeli.

### 15.8 Bu bölümün ürettiği/ürtemediği

- ÜRETİLDİ: §14 (M2 eksik girişi), bu §15 (freshness-check + rehearsal + kronolojik
  sıra bulgusu + CI-enforcement netleştirmesi + M5 retention-cron bulgusu).
  Yalnız CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02 görev talimatının açıkça izin
  verdiği kapsamda: eksik giriş ekleme, bayat durum düzeltmesi (CpeDecisionLog satır
  sayısı), bağımlılık/yetki kaydı (M1→M5, kronolojik sıra).
- ÜRETİLMEDİ: hiçbir migration için READY/GO kaydı; hiçbir program kapanış durumu
  değişikliği; hiçbir APPLIED işareti; §10/§11/§12/§13'ün mevcut metninde HİÇBİR
  DEĞİŞİKLİK (yalnız ek, append-only — §7→§8/§9 emsali).
- Bu bölüm hiçbir migration'ı SEÇMEZ/yetkilendirmez. Sonraki adım owner'ın 8 ayrı
  GO-MIGRATE kararı (veya toplu bir karar) vermesidir — bkz. final rapor.
---

## 16. CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02 — canlı icra kapanışı (2026-07-23)

Bu bölüm **fiilî canlı icrayı** kaydeder. §10–§14'teki migration girişlerinin `LIVE DB APPLY`
hücreleri bu icra ile **APPLIED — TRAIN-R02** durumuna alınmıştır; kuyruk **DRAINED**'dır.
§15, aynı train'in **GO-ANALYZE freshness-check + tam zincir rehearsal** kaydıdır (ayrı oturum,
PR #1550); bu bölüm o analiz/rehearsal zincirinin **icra ayağını** tamamlar ve §15'i
**silmez/yeniden yazmaz** — analiz→rehearsal→icra hattı bütün olarak okunur.

### 16.1 Yetki ve icra

Owner, Gate 0'ın bulduğu **gerçek** pending kümenin tamamını (8 migration) tek koordineli
pencerede ratifiye etti (`TRAIN-R02 — M1-M8 RATIFICATION + EXECUTION`). Register'daki girişler
tek başına icra edilemezdi: `prisma migrate deploy` belirli migration seçemez ve M2/M3
ratifiye M1 ile M4'ün **arasında** duruyordu.

```text
EXECUTION SHA (FROZEN): b3b0fa5b8183fa7e75ba4341be60dbdcfb524c69
TARGET DB             : hukuk_db @ localhost:5432 (container hukuk-postgres, postgres:16-alpine)
DEPLOY                : tek `prisma migrate deploy` (prisma 5.22.0)
DEPLOY WINDOW (UTC)   : 2026-07-23T16:44:15Z → 2026-07-23T16:44:19Z
RESULT                : All migrations have been successfully applied. (exit 0)
```

### 16.2 Uygulanan küme (M1–M8, kronolojik) — §15 rehearsal zinciriyle birebir

| # | Migration | Domain | Register girişi |
|---|---|---|---|
| M1 | `20260722170000_uyap_operation_attempt_schema_foundation_r1` | UYAP | §10 |
| M2 | `20260722213239_office_phase2_cap09a_foundation_audit_attribution` | OFFICE | §14 |
| M3 | `20260722224901_of01_history_p04a1_r1_service_regime_code` | DEBTOR | (kayıtsızdı) |
| M4 | `20260722230000_cpe_decision_composite_reference_key` | POLICY ENGINE | §11 |
| M5 | `20260723010000_uyap_attempt_cpe_decision_link` | UYAP | §12 |
| M6 | `20260723100000_claim_formation_intent_snapshot_foundation` | RECEIVABLE | §13 |
| M7 | `20260723120000_of01_history_p04a1_r2_completion_mode_schema` | DEBTOR | (kayıtsızdı) |
| M8 | `20260723120100_of01_history_p04a1_r2_completion_mode_constraints` | DEBTOR | (kayıtsızdı) |

İcra sırası, §15'te rehearsal edilen zincirle **birebir aynıdır**.

### 16.3 Gate kanıtları (hepsi PASS)

| Gate | Kanıt |
|---|---|
| **Gate 0** | Canlı pending = **exact M1–M8** (programatik `diff`, sıra artan) |
| **SHA freeze** | `b3b0fa5b8183…`; deploy anında drift **yok** (yeniden doğrulandı) |
| **Backup** | `pg_dump -Fc`, **950 378 bayt**, SHA-256 `ebd4f79be98f90153e59d7b73fb55dbab02c61841b15e2adefa52cef72f603be` |
| **Restore verify** | Disposable `postgres:16-alpine`, **7/7 invariant** eşleşti (Tenant 3, User 7, Case 8, CpeDecisionLog 0, ServiceOccurrence 0, `_prisma_migrations` 94, tablo 192) |
| **Writer quiescence** | Tek DB yazıcısı (RUNTIME worktree API + `@Cron`) durduruldu → application writer **0**, bekleyen lock **0**, host→5432 TCP **0** |
| **Rehearsal** | §15 tam zincir rehearsal + bu icrada canlının **birebir kopyasında** 8/8 tekrar; "up to date"; başarısız/yarım **0** |
| **Domain tests** | **122 PASS** — 49 (UYAP/CPE db-gated) + 73 (DEBTOR ServiceOccurrence, RCV claim-formation, OFFICE audit) |

### 16.4 Post-validation (canlı, M1–M8 ayrı ayrı)

| Migration | Doğrulama | Sonuç |
|---|---|---|
| M1 | 2 tablo · 3 enum · 10 composite FK · 4 CHECK | ✓ |
| M2 | `AuditLog` 7 yeni kolon (`actorType`/`correlationId`/`decisionResult`/`policyRef`/`policyVersion`/`reasonCode`/`requestId`) | ✓ |
| M3 | `ServiceOccurrence.serviceRegimeCode` kolonu | ✓ |
| M4 | `CpeDecisionLog_id_caseId_key` UNIQUE index | ✓ |
| M5 | link tablosu · 3 FK `confdeltype='r'` · `..._cpeDecisionLogId_key` · `UyapOperation_id_caseId_tenantId_key` | ✓ |
| M6 | `ClaimItemFormationIntent` + `ClaimFormationSnapshot` | ✓ |
| M7/M8 | `serviceCompletionMode` + `substituteRecipientBasis` · 2 completion constraint | ✓ |

**M3 constraint notu:** M3'ün eklediği `occ_p04a1r1_regime_code_pairs_with_date_role_check` canlıda
**yoktur** ve bu **doğru nihai durumdur** — M8 aynı pencere içinde onu `DROP CONSTRAINT` edip
`occ_p04a1r2_regime_code_pairs_with_date_role_check` ile değiştirir (DEBTOR R2 supersede'i).
Deploy'daki tek yıkıcı ifade budur ve kendi migration'ının kapsamındadır.

### 16.5 Canlı son durum — çifte uygulama YOK

```text
prisma migrate status : "Database schema is up to date!" (102/102 canonical)
_prisma_migrations    : M1-M8'in her biri TEK satır, applied_steps_count=1,
                        rolled_back_at yok, hepsi 2026-07-23T16:44:18Z
                        → çifte uygulama YOK, kısmi hata YOK
finished_at IS NULL / rolled_back_at IS NOT NULL : 0
DATA / BACKFILL       : NONE — satır sayıları deploy öncesi backup ile birebir aynı
YENİ TABLOLAR         : UyapOperation / UyapAttempt / UyapAttemptCpeDecisionLink /
                        ClaimItemFormationIntent / ClaimFormationSnapshot → toplam 0 satır
API                   : yeniden başlatıldı, DB'ye bağlandı, HTTP yanıt veriyor (:8080)
```

### 16.6 Disposition

- §10/§11/§12/§13/§14 **APPLIED / TRAIN-R02**; bu register bakımından pending migration **KALMAMIŞTIR**.
- §15 (freshness-check + rehearsal) **korunur**; bu bölüm onun icra tamamlayıcısıdır.
- Bu kayıt hiçbir yeni migration, feature-flag, runtime aktivasyon veya GO-OPERATE yetkisi
  **ÜRETMEZ**. UYAP link writer / module registration / gerçek transport, P-E5D/P-E5E/P-E6 ve
  diğer residual işler **HOLD**'da kalır.

### 16.7 Kapanış verdict'i

```text
CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02:
CLOSED — 8/8 APPLIED (tek koordineli pencere) / QUEUE DRAINED /
POST-VALIDATED / DATA MUTATION 0 / DOUBLE-APPLY 0

IMPLEMENTATION AUTHORITY: NONE — bu kapanış kaydı hiçbir yeni yetki üretmez.
```

## 17. OFFICE-CAP09A-MIGRATION-CI-COVERAGE-R01 — governance kapanışı (2026-07-23)

Bu bölüm, §14/§16'da `APPLIED — TRAIN-R02` olarak kaydedilen M2
(`office_phase2_cap09a_foundation_audit_attribution`) migration'ının kendi
readiness-debt'ini — repository'de var olan ama required CI'da hiç
çalışmayan 2 test dosyasını — kapatır. §14/§16'nın metnini **değiştirmez**;
yalnız ek bir kapanış kaydıdır (append-only, §7→§8/§9 ve §15→§16 emsali).

### 17.1 Root cause

`ci.yml`'in `test-suite` job'ı yalnız dar, açık `--testPathPattern`/
`--runTestsByPath` adımlarından oluşur, catch-all adım yoktur. M2'nin
`AuditLog` attribution alanlarını (`actorType`/`correlationId`/
`decisionResult`/`policyRef`/`policyVersion`/`reasonCode`/`requestId`)
doğrulayan 2 test dosyası için hiçbir adım açılmamıştı — bu, §15
freshness-check sırasında tespit edilmiştir.

### 17.2 Kapanış kaydı

| Alan | Değer |
|---|---|
| Kapsam | Yalnız `.github/workflows/ci.yml`; migration/schema/runtime **YOK** |
| Eklenen adım | `test-suite` job → "OFFICE-CAP09A-FOUNDATION-I01 audit attribution unit tests" |
| Kapsadığı testler | `audit-metadata-builder.spec.ts` (23 test) + `audit.service.attribution.spec.ts` (3 test) |
| PR / squash SHA | PR #1560 / `a72031c03dcb68c3e69408e54d8fe17e5fe137e4` |
| CI kanıtı (gerçek GitHub Actions log) | `PASS ...audit.service.attribution.spec.ts` + `PASS ...audit-metadata-builder.spec.ts`; `Test Suites: 2 passed, 2 total`; `Tests: 26 passed, 26 total` |
| Required CI | Architectural Guardrails / Test Suite / Web Tests (vitest) / Client Workspace Live Smoke — **4/4 PASS** |
| **LIVE DB MUTATION** | **NONE** |
| **RUNTIME CHANGE** | **NONE** |

### 17.3 Disposition

- M2'nin kendisi (şema) zaten §16 kapsamında canlıya **APPLIED**'dır — bu
  kayıt yeni bir migration icrası **DEĞİLDİR**, yalnız o migration'ın test
  kapsamı borcunu kapatır.
- Bu kapanış hiçbir yeni migration, runtime aktivasyon veya GO-OPERATE
  yetkisi **ÜRETMEZ**.

```text
OFFICE-CAP09A-MIGRATION-CI-COVERAGE-R01:
CLOSED / CANONICAL

IMPLEMENTATION AUTHORITY: NONE — bu kapanış kaydı hiçbir yeni yetki üretmez.
```

## 18. RCV-CLAIM-FORM-P02-S08-D02-PB01-PERSISTENCE-FOUNDATION — pending migration (2026-07-26)

Bu bölüm, legal/audit projection-binding persistence foundation migration'ını koordinasyon
kuyruğunda görünür kılar. Migration'ın merge edilmesi canlı uygulama yetkisi değildir.

| Alan | Değer |
|---|---|
| Migration | `20260726120000_claim_formation_projection_binding_persistence` |
| Program / task | RECEIVABLE / `RCV-CLAIM-FORM-P02-S08-D02-PB01-PERSISTENCE-FOUNDATION` |
| İçerik | `ClaimItemFormationIntent` + `ClaimFormationSnapshot` için nullable exact binding triple, 8 CHECK ve existing snapshot-validation function extension |
| Existing migration mutation | NONE |
| Default / backfill / data mutation | NONE |
| Index / duplicate trigger | NONE |
| Runtime activation | NONE / DORMANT |
| Live apply | **NOT AUTHORIZED / NOT PERFORMED** |
| Disposable evidence | clean + upgrade 103/103; rollback/reapply + non-null hard-stop PASS |

### 18.1 Apply öncesi zorunlu gate

- Fresh canonical SHA ve migration queue tekrar pinlenir; `prisma migrate status` sonucu bu eski
  snapshot'tan türetilmez.
- Ayrı ve explicit owner `GO-MIGRATE` olmadan development/live/staging/production DB'ye apply yoktur.
- Backup/restore verification, writer quiescence, maintenance window ve post-validation planı ayrı
  execution kaydında tamamlanır.
- Existing Claim Formation runtime dormant kalır; migration apply runtime activation değildir.

### 18.2 Rollback hard-stop

Rollback yalnız runtime inactive iken ve hem `ClaimItemFormationIntent` hem
`ClaimFormationSnapshot` üzerinde üç binding alanından herhangi biri non-null olan satır sayısı
**sıfır** ise güvenlidir. Herhangi bir bound row legal/audit evidence sayılır; bu durumda columns,
constraints veya function rollback'i **PROHIBITED / HARD STOP**tur. Otomatik nulling, backfill,
historical inference, re-admission veya bypass yoktur. Repository'de canonical down migration
eklenmemiştir.

```text
RCV-CLAIM-FORM-P02-S08-D02-PB01-PERSISTENCE-FOUNDATION MIGRATION:
MERGED UPON APPROVED MERGE / PENDING LIVE APPLY

LIVE APPLY AUTHORITY:
NONE
```

---

## 19. PROGRAM-WIDE SPRING CLEANING — merged migration visibility reconciliation (2026-07-27)

Kaynak: `PROGRAM-WIDE-SPRING-CLEANING-FULL-AUTHORIZED-EXECUTION-R01`, Wave 3 mekanik
reconciliation. Kanıt: `project/docs/governance/spring-cleaning/PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md` §1.

Aşağıdaki iki migration canonical `main`'e merge edilmiş, fakat bu register'a **hiç
kaydedilmemişti**. Bu bölüm yalnız **cross-workstream görünürlük** sağlar; register'ın kendi
statüsü `LIVING / NON-NORMATIVE`'dir ve domain governance, live-apply veya implementation
yetkisi **ÜRETMEZ**.

| Migration | Task | PR | Squash | Live apply |
| --- | --- | --- | --- | --- |
| `20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation` | `CLIENT-P2-U03-TRACK-B-I01` | #1629 | `32a42ed4` | **UNKNOWN / OWNER VERIFICATION REQUIRED** |
| `20260726210000_uyap_poa_tenant_safety_i01` | `UYAP-POA-TENANT-SAFETY-I01` (canonical decomposition'da `…-I02`) | #1633 | `e20b36ff` | **UNKNOWN / OWNER VERIFICATION REQUIRED** |

### 19.1 Live-apply durumu neden UNKNOWN

Spring Cleaning programı gerçek `hukuk_db`'ye bağlanmamış, hiçbir `.env` veya production
credential okumamıştır. Bu nedenle iki migration'ın canlı veritabanına uygulanıp uygulanmadığı
**iddia edilmemektedir**. Önceki train'lerin (R01/R02) aksine burada `applied` veya
`post-validated` kanıtı YOKTUR.

### 19.2 `20260726210000_uyap_poa_tenant_safety_i01` — açık gate

`project/docs/blueprint/UYAP-CPE-POA-ACTING-LAWYER-AUTHORITY-DESIGN-v1.0.md` §L şunu şart koşar:

```text
"I02 ayrıca pending-migration-coordination-register GO-MIGRATE gate'i gerektirir."
```

Bu gate kaydı, migration merge edildiği anda **bu register'da mevcut değildi**. Bu bölüm gate'i
retroaktif olarak **AÇMAZ** ve migration'ı yetkilendirmez; yalnız boşluğu görünür kılar.
Yetki sorusu owner kararına bırakılmıştır:
`spring-cleaning/PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-02.

```text
SPRING-CLEANING MIGRATION VISIBILITY RECONCILIATION:
RECORDED / MECHANICAL

LIVE APPLY AUTHORITY:
NONE

GO-MIGRATE GATE (uyap_poa_tenant_safety):
OPEN / OWNER DECISION REQUIRED
```

---

## 20. SPRING-CLEANING OWNER RESIDUALS — migration live-apply ÖLÇÜMÜ (2026-07-27)

Kaynak: `PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01` / ITEM-02 §5.

§19 üç migration'ı `UNKNOWN / OWNER VERIFICATION REQUIRED` olarak kaydetmişti çünkü o turda
veritabanına erişilmemişti. Bu bölüm o boşluğu **ölçümle** kapatır.

### 20.1 Ölçüm yöntemi ve sınırı

```text
komut  : prisma migrate status --schema prisma/schema.prisma   (SALT OKUMA)
hedef  : .env'in çözdüğü local development database
tarih  : 2026-07-27

OKUNMAYAN / RAPORLANMAYAN:
  .env dosya içeriği · connection string · credential · şifre · veri içeriği
UYGULANAN MIGRATION:
  YOK — migrate status hiçbir migration uygulamaz
```

`prisma migrate status`, `.env`'i kendi içinde yükler; bu görev `.env` değerlerini **görmemiş
ve aktarmamıştır**. Çıktının yalnız migration adı + uygulanma durumu kısmı kullanılmıştır.

### 20.2 Ölçüm sonucu

```text
105 migration bulundu
UYGULANMAMIŞ 3 migration:
```

| Migration | Task | PR | Squash | Local dev DB |
| --- | --- | --- | --- | --- |
| `20260726120000_claim_formation_projection_binding_persistence` | `RCV-CLAIM-FORM-P02-S08-D02-PB01` | #1630 | `d7ef31f6` | **NOT APPLIED** |
| `20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation` | `CLIENT-P2-U03-TRACK-B-I01` | #1629 | `32a42ed4` | **NOT APPLIED** |
| `20260726210000_uyap_poa_tenant_safety_i01` | `UYAP-POA-TENANT-SAFETY-I02` (repo etiketi `-I01`) | #1633 | `e20b36ff` | **NOT APPLIED** |

### 20.3 Statü düzeltmesi

```text
ÖNCE (§19)  : LIVE APPLY = UNKNOWN / OWNER VERIFICATION REQUIRED
SONRA (§20) : LOCAL DEV DB = NOT APPLIED   (ölçülmüş, 2026-07-27)
              PRODUCTION   = UNKNOWN       (production DB'ye erişilmedi)
```

Bu iki eksen **birbirinin yerine geçmez**. Local development veritabanında uygulanmamış olması
production hakkında hiçbir şey söylemez; production hakkında da hiçbir iddia üretilmemiştir.

### 20.4 Bu bölümün üretmedikleri

```text
MIGRATION APPLY YETKİSİ        : NONE — hiçbir migration uygulanmadı, uygulama yetkisi doğmadı
GO-MIGRATE GATE                : AÇILMADI (UYAP §L'nin şart koştuğu gate hâlâ açık)
RETROAKTİF RATİFİKASYON        : NONE
YENİ MIGRATION                 : YOK
```

Üç migration da merge edilmiş fakat hiçbir çalışan veritabanında etkin değildir; ilgili
şema sözleşmeleri bu nedenle `IMPLEMENTATION_COMPLETE / NOT APPLIED` durumundadır.

```text
SPRING-CLEANING OWNER RESIDUALS MIGRATION MEASUREMENT:
RECORDED / MEASURED

LIVE APPLY AUTHORITY:
NONE
```

---

## 21. CLIENT-P2-U03-TRACK-B-I01 — canlı migration durumu doğrulaması (2026-07-28, SALT-OKUMA)

Kaynak: `CLIENT-P2-U03-TRACK-B-POST-SCHEMA-RATIFICATION-R01` Phase A (owner `GO-COMPLETE — ANALYZE-FIRST — OPERATIONAL READ-ONLY` yetkisi).

§19 bu migration'ı `UNKNOWN / OWNER VERIFICATION REQUIRED`, §20 ise yalnız `prisma migrate status` çıktısıyla `NOT APPLIED` olarak kaydetmişti. Bu bölüm, statü-çıktısının ötesine geçip **veritabanı metadata'sı ile çapraz doğrulama** yapar ve iki satır arasındaki çelişkiyi kanıtla kapatır.

### 21.1 Hedef ortam kimliği

```text
current_database              : hukuk_db
server                        : PostgreSQL 16.14 (x86_64-pc-linux-musl)
addr / port                   : 172.18.0.5 / 5432   (localhost:5432 uzerinden)
current_user                  : postgres
pg_is_in_recovery             : false   (primary, replica DEGIL)
Tenant satir sayisi           : 3       (§2'nin 2026-07-21 tespitiyle tutarli)
```

Repoda **tek** `DATABASE_URL` adayı vardır (`project/apps/api/.env`); `.env.production`, `.env.staging`, secret manager, vault, terraform, helm veya k8s manifesti **yoktur**. Bu nedenle hedef ortam repository truth içinde tekil ve belirsizlik taşımaz; §2'nin canonical hedefiyle (`localhost:5432` / `hukuk_db`) birebir örtüşür.

**Kapsam dürüstlüğü:** bu ölçüm yalnız bu tek hedef için geçerlidir. §20.3'ün "PRODUCTION = UNKNOWN" kaydı **korunur** — repository'de temsil edilmeyen bir ortam hakkında bu bölüm hiçbir iddia üretmez.

### 21.2 Salt-okuma güvenlik kanıtı

```text
SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY   -> uygulandi
default_transaction_read_only                          -> on (dogrulandi)
calistirilan ifade turu                                -> yalniz SELECT
DDL / DML / TRUNCATE / GRANT                           -> 0
migrate deploy | dev | reset | db push | db seed        -> CALISTIRILMADI
shadow database                                        -> OLUSTURULMADI
credential exposure                                    -> NONE
  (DATABASE_URL surec ici okundu; komut satirina, ciktiya, diske veya
   commit'e HIC girmedi; kullanici adi ve parola okunmadi/yazdirilmadi)
mutation performed                                     -> NONE
```

### 21.3 Kanıt

```text
_prisma_migrations tablosu       : VAR
  toplam / basarili / rolled / yarim : 102 / 102 / 0 / 0
  son uygulanan                      : 2026-07-23
  ghost kayit (DB'de var, repoda yok): 0
  checksum uyumu (102 kayit)         : 102/102 UYUMLU, 0 uyumsuz

HEDEF migration kaydi            : YOK
  20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation
  repo migration.sql sha256      : af3c84ac17e13e8d6fe46cbd2b263fda96c7854356a805183bb7fc4c02c87e6c

I01 schema nesneleri
  ClientFinancialDisclosure*     : 0/3 tablo
  ClientFinancialDisclosureStatus: enum YOK
  pg_class eslesmesi             : 0
  pg_constraint eslesmesi        : 0
  %disclosure% / ClientFinancial%: hicbir tablo YOK

Kismi / manuel uygulama izi      : YOK
  (I01'e ozgu kolon adlari taramasinda cikan 5 eslesme — ClaimFormationSnapshot,
   IcrabotEngineRun, IcrabotEvidence, IcrabotJobStep, LegalApplicationBatch
   uzerindeki `snapshotHash` — pre-existing, ILGISIZ modellere aittir;
   I01 tablolarinda 0 eslesme)

Pre-I01 canonical durum          : Tenant / Case / CaseClient /
                                   CollectionDisposition / CollectionDispositionLine — hepsi VAR

repo migration klasoru           : 106
DB basarili kayit                : 102
pending                          : 4
```

### 21.4 Drift analizi

Salt-okuma `prisma migrate diff --from-schema-datasource → --to-schema-datamodel` (245 satır; shadow DB oluşturmaz) çıktısı sınıflandırıldı:

| Diff içeriği | Ait olduğu pending migration |
| --- | --- |
| `ClientFinancialDisclosure` + `...Version` + `...Line` + `ClientFinancialDisclosureStatus` | `20260726190741_..._track_b_i01_...` (bu bölümün hedefi) |
| `ClaimFormationSnapshot` / `ClaimItemFormationIntent` → `legalBasisProjectionBindingCanonicalPayload` | `20260726120000_claim_formation_projection_binding_persistence` |
| `ClientPowerOfAttorney` / `PoaLawyer` → `tenantId` + index + FK yeniden bağlama | `20260726210000_uyap_poa_tenant_safety_i01` |
| `CpeExecutionRecord` → `tenantId` + index | `20260728120000_debtor_cpe_tenant_hardening_p1_i01` |
| `BankSettlementEvidence` / `BankTransaction` `RENAME CONSTRAINT` ×2 | **hiçbiri** — pre-existing adlandırma drift'i |

**I01 bakımından beklenmeyen drift YOKTUR**: diff, I01 nesnelerini sıfırdan yaratır; hiçbir I01 nesnesi kısmen mevcut değildir, hiçbir mevcut nesne I01 nedeniyle düşürülmez veya değiştirilmez. Kalan 2 `RENAME CONSTRAINT`, PR #1629 sırasında tespit edilip kapsam dışı bırakılan pre-existing drift'tir ve **bu görev kapsamında düzeltilmemiştir**.

### 21.5 Sınıflandırma

```text
LIVE MIGRATION STATUS:
NOT_APPLIED

verifiedAt            : 2026-07-28
verified environment  : hukuk_db @ localhost:5432 (PostgreSQL 16.14, primary)
verification method   : prisma migrate status (salt-okuma) + _prisma_migrations
                        metadata + information_schema/pg_catalog nesne taramasi +
                        checksum karsilastirmasi + read-only migrate diff
migration name        : 20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation
repository SHA        : 32a42ed4 (PR #1629) · governance closure f16202a6 (PR #1705)
credential exposure   : NONE
mutation performed    : NONE
```

§19'un `UNKNOWN / OWNER VERIFICATION REQUIRED` satırı bu bölümle **kanıta bağlanmış** ve §20'nin `NOT APPLIED` ölçümü **daha güçlü kanıtla teyit edilmiştir**. §19 ve §20'nin kendi metinleri DEĞİŞTİRİLMEMİŞTİR (append-only).

### 21.6 Bu bölümün üretmedikleri

```text
LIVE APPLY PRECONDITION        : NOT SATISFIED
MIGRATION APPLY YETKISI        : NONE — hicbir migration uygulanmadi, yetki dogmadi
GO-MIGRATE GATE                : ACILMADI
DIGER 3 PENDING MIGRATION      : bu bolumun hedefi DEGIL; statuleri degistirilmedi
PRE-EXISTING RENAME DRIFT      : duzeltilmedi, ayri backlog kalemi
PRODUCTION IDDIASI             : YOK
```

**MIGRATION MERGED ≠ MIGRATION APPLIED · READ-ONLY VERIFIED ≠ APPLY AUTHORIZED.**

---

## 22. MIGRATION-TRAIN-POST-APPLY-FACTUAL-RECONCILIATION-R01 — beş migration'ın fiilî live-apply kaydı (2026-07-28)

Kaynak: `MIGRATION-TRAIN-POST-APPLY-RECOVERY-P01` / TASK 02 (owner `GO-COMPLETE — ANALYZE-FIRST — FULL PROGRAM EXECUTION AUTHORITY`).

§19 bu migration'ları `UNKNOWN`, §20 ve §21 `NOT APPLIED` olarak kaydetmişti. **Bu bölüm o kayıtları fiilî gerçekle hizalar.** §19/§20/§21'in kendi metinleri DEĞİŞTİRİLMEMİŞTİR (append-only).

### 22.1 Hedef

```text
target        : localhost:5432 / hukuk_db
engine        : PostgreSQL 16.14, primary (pg_is_in_recovery = false)
PRODUCTION CLAIM: NONE — repository disinda temsil edilmeyen hicbir
                  staging/production ortami hakkinda iddia URETILMEMISTIR
```

### 22.2 Fiilî apply kaydı

```text
APPLY STATUS   : APPLIED
APPLIED AT     : 2026-07-28 00:33:21.611 – 00:33:21.823 UTC  (212 ms, sirali)
APPLY ACTOR    : UNATTRIBUTED / NOT DETERMINED
APPLY METHOD   : single prisma migrate deploy — migration timestamp'lerinden
                 CIKARIM (inferred); dogrudan komut kanidi YOKTUR
PRE-APPLY BACKUP: NONE VERIFIED
AUTHORIZED TRAIN: dort migration
ACTUAL TRAIN    : bes migration
```

| # | Migration | PR / SHA | checksum (ilk 16) | finished_at (UTC) | Yetki |
| --- | --- | --- | --- | --- | --- |
| 1 | `20260726120000_claim_formation_projection_binding_persistence` | #1630 `d7ef31f6` | `09517a2e08d0ec4b` | `00:33:21.611` | yetkili |
| 2 | `20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation` | #1629 `32a42ed4` | `af3c84ac17e13e8d` | `00:33:21.733` | yetkili |
| 3 | `20260726210000_uyap_poa_tenant_safety_i01` | #1633 `e20b36ff` | `7c8e1502a918dd17` | `00:33:21.777` | yetkili |
| 4 | `20260728120000_debtor_cpe_tenant_hardening_p1_i01` | #1711 `a919fdc5` | `03aea6c7b9afd98b` | `00:33:21.806` | yetkili |
| 5 | `20260728130000_office_p2_cap02_reportingline_user_fk_hardening_i01` | #1717 `002c2e0b` | `7e036d89923aaf60` | `00:33:21.823` | **YETKİSİZ** (train dışı) |

Hepsi `applied_steps_count = 1`, `rolled_back_at = NULL`, `logs = NULL`, checksum repository ile uyumlu.

### 22.3 Veritabanı sağlığı (salt-okuma doğrulaması)

```text
_prisma_migrations toplam / basarili / rolled-back / yarim : 107 / 107 / 0 / 0
repo migration klasoru                                     : 107
pending                                                    : 0
ghost (DB'de var, repoda yok)                              : 0
checksum uyumsuz                                           : 0
```

### 22.4 Apply incident kaydı

```text
INCIDENT: UNATTRIBUTED_PARALLEL_MIGRATION_APPLY

IMPACT:
  - bes migration uygulandi
  - biri yetkilendirilmis dort uyeli train'in DISINDA
  - dogrulanabilir pre-apply backup YOK
  - sart kosulan backup -> restore rehearsal -> clone rehearsal protokolu ATLANDI
  - islemi yapan aktor BELIRLENEMEDI

CURRENT DATABASE HEALTH:
  107/107 applied · checksum clean · failed/rolled-back/partial 0
```

Bu kayıt hiçbir kişiye veya ajana isnat içermez. `MIGRATION-TRAIN-20260728-PENDING-FOUR-LIVE-APPLY-R01` görevi bu nedenle `BLOCKED / COMPETING_MIGRATION_OPERATION` ile durdurulmuş ve hedefe **hiçbir yazma yapmamıştır**.

### 22.5 Post-apply koruyucu yedek (TASK 01)

```text
MIGRATION-TRAIN-POST-APPLY-PROTECTIVE-BACKUP-R01 : CLOSED / PASS

format          : pg_dump custom (-Fc)
size            : 1.052.910 bytes
sha256          : 69e55de4421f608d7fd0ade6e4f9b0e78ab3abec1dd579d1f6d5e4be51f0949a
pg_dump exit    : 0
pg_restore --list exit : 0   (TOC 2084 giris, okunabilir)
restore rehearsal      : PASS — disposable clone, 12/12 tablo paritesi,
                         107 basarili / 0 rolled-back / 0 yarim
konum           : yalniz local makine; repository DISI, commit EDILMEDI
```

**POST-APPLY PROTECTIVE BACKUP ≠ PRE-APPLY BACKUP** — bu yedek geçmişteki kontrolsüz apply'ı geriye dönük güvenli hâle getirmez; yalnız bu noktadan itibaren bir koruma noktası sağlar.

### 22.6 UYAP POA tenant FK drift'i

```text
UYAP POA TENANT FK DRIFT : OPEN / BLOCKING FOR UYAP TENANT-INTEGRITY CLOSURE

EKSIK:
  ClientPowerOfAttorney_tenantId_fkey
  PoaLawyer_tenantId_fkey

CLIENT I02 IMPACT: NONE
```

`schema.prisma` her iki modelde `tenant Tenant @relation(..., onDelete: Cascade)` tanımlar; `20260726210000_uyap_poa_tenant_safety_i01` migration'ı bu iki FK'yi **hiç üretmez** (SQL'de 0 kez geçer) ve canlı DB'de mevcut değildir. Bu, `UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01` ile ayrı bir corrective migration olarak kapatılacaktır. **UYAP POA DRIFT ≠ CLIENT I01 LIVE MIGRATION NOT APPLIED.**

### 22.7 Bu bölümün üretmedikleri

```text
OWNER-AUTHORIZED APPLY IDDIASI     : URETILMEDI — apply unattributed'dir
CONTROLLED REHEARSAL IDDIASI       : URETILMEDI — prova yapilmadi
RETROAKTIF RATIFIKASYON            : NONE
MIGRATION APPLY YETKISI            : bu bolumle URETILMEZ
DIGER PROGRAMLARIN KAPANIS STATUSU : DEGISTIRILMEDI
Bank constraint-name drift'i       : DUZELTILMEDI (ACCEPTED_PRE_EXISTING)
```

**MIGRATION APPLIED ≠ PROGRAM CLOSED · APPLIED ≠ SAFELY APPLIED · UNATTRIBUTED ≠ UNAUTHORIZED-BY-A-NAMED-ACTOR.**

---

## 23. UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01 — corrective migration (2026-07-28)

Kaynak: `MIGRATION-TRAIN-POST-APPLY-RECOVERY-P01` / TASK 03.

§22.6'da `OPEN` olarak kaydedilen UYAP POA tenant FK drift'ini kapatan **additive corrective migration** üretildi. Bu bölüm yalnız migration'ın varlığını ve live-apply beklediğini kaydeder; **live-apply gerçeği ayrı bir bölümle kaydedilecektir.**

```text
MIGRATION : 20260728140000_uyap_poa_tenant_fk_drift_remediation_r01
KAPSAM    : yalniz iki eksik Tenant FK
              ClientPowerOfAttorney_tenantId_fkey
              PoaLawyer_tenantId_fkey
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE   (canonical schema sozlesmesi)
SCHEMA    : schema.prisma DEGISTIRILMEDI — iliskiler zaten dogru tanimliydi
DESTRUCTIVE: yok (tablo/kolon silinmez, veri degistirilmez)
HISTORICAL MIGRATION: DEGISTIRILMEDI

VERI BUTUNLUGU KAPISI (salt-okuma, uygulama oncesi — hepsi 0):
  tenantId NULL (POA / PoaLawyer)                  : 0 / 0
  orphan tenantId (POA / PoaLawyer)                : 0 / 0
  POA vs Client · PoaLawyer vs POA · vs Lawyer     : 0 / 0 / 0

LIVE APPLY: MERGED UPON APPROVED MERGE / PENDING LIVE APPLY
LIVE APPLY AUTHORITY: TASK 03 kapsaminda, implementation PR merge edildikten SONRA
```

---

## 24. UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01 — live apply (2026-07-28)

Kaynak: `MIGRATION-TRAIN-POST-APPLY-RECOVERY-P01` / TASK 03, live-apply closeout (PR B).

§23'te `PENDING LIVE APPLY` olarak kaydedilen corrective migration **uygulanmıştır**. Bu, bu programda hedefe **yetkiyle ve protokole uygun yapılan tek yazma işlemidir**.

### 24.1 Uygulama kaydı

```text
MIGRATION      : 20260728140000_uyap_poa_tenant_fk_drift_remediation_r01
TARGET         : localhost:5432 / hukuk_db  (PostgreSQL 16.14, primary)
KOMUT          : prisma migrate deploy   (tek sefer, paralel process yok)
FINISHED AT    : 2026-07-28 01:44:58.964
ROLLED BACK AT : NULL
APPLIED STEPS  : 1
CHECKSUM       : bb6f24f32103ce03…   (repo migration.sql sha256 ile UYUMLU)
REPOSITORY SHA : 6bee8d3d (PR #1731)
APPLY ACTOR    : MIGRATION-TRAIN-POST-APPLY-RECOVERY-P01 / TASK 03  (yetkili, attributed)
PRODUCTION CLAIM: NONE
```

### 24.2 Uygulama öncesi güvenlik

```text
pre-remediation backup : pg_dump -Fc, 1.052.910 bytes
  sha256               : ef49d5f6b4ea2f1692613db06a6e77759219a7722ec6b2d97b9893080300fad0
  pg_restore --list    : exit 0
hedef, TASK 01 yedeginden bu yana DEGISMEMISTI (107 migration, ayni satir sayimlari)
program lock           : competing writer YOK
pending set            : YALNIZ corrective migration (1)
veri butunlugu kapisi  : 7 olcumun tamami 0 (NULL / orphan / cross-tenant uyumsuzluk)
temiz DB provasi       : PASS (bos -> 108 migration)
restore clone provasi  : PASS (107 -> 108, veri korundu, drift kapandi)
testler (clone)        : poa-tenant-safety 14/14 · db/core-lifecycle 23 suite / 164 test
dis (teeth) dogrulamasi: FK'ler dusuruldugunde 2 test FAIL, geri konuldugunda 14/14 PASS
```

### 24.3 Uygulama sonrası doğrulama

```text
prisma migrate status : "Database schema is up to date!"
_prisma_migrations    : 108 toplam / 108 basarili / 0 rolled-back / 0 yarim
pending               : 0
checksum uyumsuz      : 0

ClientPowerOfAttorney_tenantId_fkey :
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE
  validated = true
PoaLawyer_tenantId_fkey :
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE
  validated = true

FK sayisi   : ClientPowerOfAttorney 1 -> 2 · PoaLawyer 2 -> 3
orphan tenantId : POA 0 · PoaLawyer 0
veri korunumu   : POA=4 PoaLawyer=2 Tenant=3 Client=15 Case=9   (uygulama oncesiyle AYNI)
```

### 24.4 Post-apply drift

```text
toplam drift ifadesi : 2
  BankSettlementEvidence RENAME CONSTRAINT  -> ACCEPTED_PRE_EXISTING_NON_BLOCKING_DRIFT
  BankTransaction        RENAME CONSTRAINT  -> ACCEPTED_PRE_EXISTING_NON_BLOCKING_DRIFT

POA-ozgu drift ifadesi : 0
  ClientPowerOfAttorney  : drift'te 0 kez
  PoaLawyer              : drift'te 0 kez
```

**Yeni veya genişlemiş drift YOKTUR.**

### 24.5 Statü

```text
UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01
IMPLEMENTED / VERIFIED / MERGED / APPLIED / CANONICAL

ClientPowerOfAttorney_tenantId_fkey : PRESENT
PoaLawyer_tenantId_fkey             : PRESENT
UYAP POA TENANT FK DRIFT            : CLOSED
```

§22.6'nın `OPEN / BLOCKING FOR UYAP TENANT-INTEGRITY CLOSURE` kaydı bu bölümle kapatılmıştır; §22'nin kendi metni DEĞİŞTİRİLMEMİŞTİR.

### 24.6 Bu bölümün üretmedikleri

```text
BASKA UYAP TASK'I CLOSED ILANI : NONE  (I03..I07 NOT GRANTED / NOT STARTED)
UYAP CUTOVER                   : HARD HOLD korunur
GO-MIGRATE GATE (UYAP §L)      : bu bolumle ACILMAZ
DECISION-1 / DECISION-2        : cozulmedi, FAIL-CLOSED default korunur
Bank constraint-name drift'i   : DUZELTILMEDI
CLIENT I01/I02 statusu         : DEGISTIRILMEDI (charter §39)
```

**MIGRATION APPLIED ≠ UYAP PROGRAM CLOSED · FK PRESENT ≠ TENANT AUTHORIZATION MODEL COMPLETE.**

---

## 25. UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 — CPE evidence bütünlüğü migration'ı: register görünürlük + fiilî live-apply kaydı (2026-07-29)

Bu bölüm, `project/apps/api/prisma/migrations/20260728160000_cpe_execution_tenant_scoped_idempotency_r02`
migration'ını bu register'a **ilk kez** kaydeder. Migration PR #1742 ile 2026-07-28'de merge
edilmiş, fakat bu register'a (ne pending ne applied olarak) hiç işlenmemişti. Bu bölüm dış bir
görevden gelen "register'da yok" tespitini kapatır. Bu kayıt yalnız **cross-workstream görünürlük
+ fiilî DB durumu**dur; hiçbir yeni migration, GO-MIGRATE yetkisi veya retroaktif ratifikasyon
ÜRETMEZ.

### 25.1 Migration kimliği ve durum

| Alan | Değer |
|---|---|
| Migration | `20260728160000_cpe_execution_tenant_scoped_idempotency_r02` |
| Domain | **POLICY ENGINE** (`CpeExecutionRecord` sahibi — model + tüm caller'lar `project/apps/api/src/modules/policy-engine/**` altında; §11'deki `CpeDecisionLog` emsaliyle aynı sınıflandırma) |
| Task / program | `UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02` ("PR A"), parent program `UYAP-MODULE-FULL-GAP-CLOSURE-R02` (bkz. `project/docs/blueprint/UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02-v1.0.md`) |
| Authority basis | PR #1742, merge SHA `6e2b114bf8477d450c8122744e05a3ae89100975`, merged 2026-07-28T07:48:34Z |
| İçerik | `CpeExecutionRecord.executionId`: GLOBAL `@unique` → `@@unique([tenantId, executionId])`. Sıra: önce yeni tenant-scoped kısıt eklenir (fail-closed duplicate-guard `DO $$` bloğu önce çakışan `(tenantId, executionId)` çiftini kontrol eder), sonra eski global `..._executionId_key` constraint/index düşürülür, ardından arama için plain `executionId` index'i yeniden yaratılır. Kısıtsız pencere yok. |
| Bulgu | Çapraz tenant idempotency çarpışması (P0): global unique + istemci-kontrollü `executionId`, bir tenant'ın başka bir tenant'ın execution kaydını `findUnique` ile okumasına ve kendi state transition'ının sessizce "duplicate" sayılıp atlanmasına (çapraz tenant DoS) yol açıyordu. Aynı PR ayrıca `DecisionLogRetentionService`'in "arşivliyorum" dediği halde fiilen `deleteMany` ile kalıcı sildiği ayrı bir P0 bulgusunu kapatır (migration'a konu değil, yalnız kod-seviyesi değişiklik). |
| Komşu migration | `20260728120000_debtor_cpe_tenant_hardening_p1_i01` aynı tabloya (`CpeExecutionRecord`) hemen önce dokunmuştur (DEBTOR-IDOR-02 bulgusu, `tenantId` kolonunu ekledi) — bu, "policy-engine DEBTOR/COLLECTION'a komşu" gözleminin kaynağıdır. Komşuluk gerçektir (aynı tablo, ardışık migration, farklı bulgu sahibi) ama **model/tablo sahipliği POLICY ENGINE'de kalır**; DEBTOR ve UYAP bu tablo üzerinde bulgu üreten/tüketen taraflardır, sahibi değildir. |
| Doğrulama (PR gövdesi) | disposable `postgres:16-alpine`: fresh chain + existing-data simülasyonu EXIT 0; fail-closed guard gerçek çakışan çiftle tetiklenip migration'ı durdurdu (exit 3, beklenen mesaj); `cpe-evidence-runtime-integrity.spec.ts` 26/26; `policy-engine` modülü 360/360; `uyap` modülü 598/598; `tsc -p tsconfig.prod.json` + `pnpm build` EXIT 0 |

### 25.2 Live-apply durumu — VERIFIED APPLIED (bugün, salt-okuma doğrulaması)

Bu bölümde de register'ın kendi disiplini izlenmiştir: yalnız `SELECT` ve `SET SESSION
CHARACTERISTICS AS TRANSACTION READ ONLY` çalıştırıldı, hiçbir DDL/DML/`migrate deploy/dev/reset`
kullanılmadı, `.env` içeriği okunmadı/aktarılmadı — yalnız çalışan `hukuk-postgres` container'ına
doğrudan `docker exec psql` ile bağlanıldı (bu worktree'de kurulu `node_modules` veya `.env`
olmadığı için `prisma migrate status` CLI yolu bu oturumda kullanılamadı — bkz. not aşağıda).

```text
verifiedAt     : 2026-07-29
target         : hukuk_db @ localhost:5432 (container hukuk-postgres, postgres:16-alpine, "Up 4 days")
identity check : current_database()=hukuk_db, pg_is_in_recovery()=false,
                 Tenant satır sayısı=3 (§2 / §21.1 ile tutarlı — aynı canonical DB)
```

| Kontrol | Sonuç |
|---|---|
| `_prisma_migrations` toplam / başarılı / rolled-back / yarım | 109 / 109 / 0 / 0 |
| Repo migration klasörü sayısı | 109 (bu migration en yenisi — hem klasör hem DB'de) |
| Pending | **0** — kuyruk şu anda tamamen boş |
| Hedef satır (`20260728160000_...`) | `started_at`=2026-07-28 19:51:43.922 UTC · `finished_at`=2026-07-28 19:51:43.943 UTC · `applied_steps_count`=1 · `rolled_back_at`=NULL |
| Şema parmak izi — yeni kısıt | `CpeExecutionRecord_tenantId_executionId_key` UNIQUE INDEX `("tenantId","executionId")` **VAR** |
| Şema parmak izi — eski kısıt | `CpeExecutionRecord_executionId_key` (eski global unique) `pg_constraint`'te **YOK** (yalnız `_pkey`, `_caseId_fkey`, `_tenantId_fkey` kalıyor) |
| Şema parmak izi — arama index'i | `CpeExecutionRecord_executionId_idx` (plain, non-unique) **VAR** |

**Sonuç: migration canlı `hukuk_db`'ye tam ve temiz uygulanmıştır** — kısmi/başarısız/geri alınmış
apply yok, checksum/adım sayısı tutarlı, migration.sql'in hedeflediği nihai şema durumu birebir
doğrulandı.

**Kanıt sınırı (statement-bazlı, snapshot değil):** yukarıdaki kontroller `SET SESSION
CHARACTERISTICS AS TRANSACTION READ ONLY` sonrası ayrı ayrı çalıştırılan 7 `SELECT`
statement'ıdır — tek bir `BEGIN ... SET TRANSACTION READ ONLY ... ROLLBACK` bloğu içinde, tek bir
transaction/snapshot altında yürütülmemiştir. Bu nedenle sorgular arasında (pratikte olası
görünmese de) concurrent bir değişiklik teorik olarak dışlanamaz; sonuçlar statement-bazlı
salt-okuma kanıtıdır, atomik/zaman-tutarlı tekil bir snapshot iddiası DEĞİLDİR.

**Araç notu:** bu oturumda önce bağlı `Prisma-Local` MCP aracıyla `migrate status` denendi;
global npx önbelleğinden Prisma **7.9.1** çalıştığı ve bu repo'nun `schema.prisma`'sı eski-stil
`datasource.url = env(...)` kullandığı için `P1012` şema doğrulama hatasıyla düştü. Bu bir
DB-durumu bulgusu DEĞİLDİR, yalnızca ortam/versiyon uyuşmazlığıdır; bu worktree'de `node_modules`
kurulu olmadığından (ve kurulum bu görevin kapsamı dışında olduğundan) yerel CLI ile
tekrarlanmadı. Gerçek DB durumu bunun yerine doğrudan `docker exec hukuk-postgres psql` ile
(yukarıdaki tablo) bağımsız olarak doğrulandı.

Ham kanıt (tool-call çıktısından birebir aktarılmıştır):

```text
Prisma schema loaded from prisma\schema.prisma.
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: The datasource property `url` is no longer supported in schema files. Move connection
URLs for Migrate to `prisma.config.ts` and pass either `adapter` for a direct database
connection or `accelerateUrl` for Accelerate to the `PrismaClient` constructor.
  -->  prisma\schema.prisma:7
 6 |   provider = "postgresql"
 7 |   url      = env("DATABASE_URL")
Validation Error Count: 1
Prisma CLI Version : 7.9.1
```

Repo manifestosu (`project/apps/api/package.json`, `devDependencies`) `"prisma": "^5.8.0"` ister —
bu bir caret range'dir, uyumlu her 5.x sürümüne izin verir ve tek başına kesin kurulu/resolved
sürümü KANITLAMAZ. Kesin çözümlenmiş sürüm ayrıca `pnpm-lock.yaml`'da doğrulanmıştır:
`/prisma@5.22.0:` (satır 11083) ve `/@prisma/client@5.22.0(prisma@5.22.0):` (satır 3712) — yani bu
repo'da fiilen resolve edilen sürüm **5.22.0**'dır, `5.8.0` değil (bu, register'ın başka
bölümlerinde — örn. §7.8 — bağımsız olarak anılan "gerçek stack: 5.22.0" ile de tutarlıdır).
Çalıştırılan CLI (7.9.1) ile bu resolved sürüm (5.22.0) arasındaki **iki majör sürüm** farkı ve
Prisma 7'de `datasource.url` alanının kaldırılmış olması, `P1012` hatasının doğrudan nedenidir. Bu
artık üç bağımsız kaynaktan (hata çıktısı + `package.json` caret range + `pnpm-lock.yaml` resolved
sürüm) doğrulanabilir bir olgudur, yorum değil.

### 25.3 Yetkilendirme izi bulunamadı (owner dikkatine)

Apply zamanı (2026-07-28 19:51:43 UTC), bu register'ın son kaydedilmiş live-apply
checkpoint'inden (§24, 2026-07-28 01:44:58 UTC, 108/108) **~18 saat sonra** ve PR #1742'nin
merge anından (07:48:34 UTC) **~12 saat sonradır**. Bu migration için:

- Bu register'da (bu bölümden önce) hiçbir `GATE ... — OWNER GO-MIGRATE` şablonu
  doldurulmuş/onaylanmış DEĞİLDİR.
- `decision-log.md`, `master-triage-register.md` ve `project/docs/governance/` altındaki hiçbir
  dosyada (tüm alt dizinler dahil, spring-cleaning kayıtları dahil) bu migration'a, PR #1742'ye
  veya `UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02` görev adına atıf YOKTUR (tam metin arama ile
  doğrulandı).
- Ayrı bir denetim dosyası (`project/docs/audit/runtime-binding-reconciliation-r01/runtime-capability-inventory.json`)
  bu migration'ı kod/PR seviyesinde kataloglar (aynı gün, `authoredAt` PR'ın merge zamanıyla
  birebir örtüşür) ama kendisi migration entry point'i için `"blockers":
  ["DEPLOYED_MIGRATION_STATE_NOT_READ"]` ve `"finalStatus": "UNKNOWN_REQUIRES_EVIDENCE"` diyerek
  DB-apply durumunu hiç okumadığını açıkça beyan eder — bu dosya da bir apply-yetki kanıtı
  DEĞİLDİR.
- Apply eden aktör/süreç bu repository kanıtından **belirlenemez** (`APPLY ACTOR: UNATTRIBUTED`).

**Sınıflandırma:**

```text
APPLIED / ATTRIBUTION_UNRESOLVED   (register terminolojisiyle: UNATTRIBUTED_MIGRATION_APPLY)
```

Migration'ın uygulandığı kanıtlanmıştır (§25.2); apply işlemini gerçekleştiren actor veya
execution path ise mevcut repository governance kayıtlarından belirlenememektedir. Bunun
ötesinde hiçbir nitelik ne iddia edilir ne de kanıtlanmıştır: apply'ın başka bir migration ile
aynı pencerede/toplu yapılıp yapılmadığı, yetkisiz bir aktör tarafından yapılıp yapılmadığı veya
bir owner tarafından fiilen onaylanıp yalnız kayda geçirilmediği — bu olasılıkların hiçbiri bu
bölümün kanıtlarıyla ne doğrulanmış ne de elenmiştir. Apply; başka bir session, CI, deploy
script, bootstrap, manuel migrate veya otomasyon ile yapılmış olabilir — hangisi olduğu bu
repository kanıtından belirlenemez. Bu bölüm herhangi bir kişiye/ajana isnat içermez ve
retroaktif ratifikasyon ÜRETMEZ — yetkilendirme sorusu owner kararına bırakılmıştır.

Ayrıca not: migration'ın kendi blueprint'i (`UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02-v1.0.md`, satır
14-15) `REAL TRANSPORT: NOT AUTHORIZED` ve `PRODUCTION CUTOVER: HARD HOLD` der — şemanın canlıya
uygulanmış olması bu HOLD'ları hiçbir şekilde değiştirmez.

### 25.4 Bu bölümün ürettiği/üretmediği

```text
ÜRETTİ : bu migration'ın register görünürlüğü (ilk kayıt) + bugünkü fiilî live-apply
         kanıtı (salt-okuma) + yetkilendirme-izi-yok bulgusu
ÜRETMEDİ:
  RETROAKTİF GO-MIGRATE RATİFİKASYONU     : NONE
  YENİ MIGRATION / SCHEMA DEĞİŞİKLİĞİ     : YOK (bu görev migration'ı UYGULAMADI, yalnız
                                            zaten uygulanmış olanı KAYDETTİ)
  ACTOR ISNADI                            : NONE
  UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02'NİN
    KENDİ PROGRAM KAPANIŞ STATÜSÜ          : DEĞİŞTİRİLMEDİ (bu register domain governance
                                            üretmez — bkz. belge başlığı)
  DİĞER PENDING MIGRATION                 : şu anda YOK (109/109, kuyruk boş)
```

```text
MIGRATION 20260728160000_cpe_execution_tenant_scoped_idempotency_r02:
CLASSIFICATION = APPLIED / ATTRIBUTION_UNRESOLVED  (UNATTRIBUTED_MIGRATION_APPLY)
REGISTERED (İLK KEZ) / LIVE DB APPLY = APPLIED (VERIFIED 2026-07-29) /
GO-MIGRATE GATE = HİÇ AÇILMAMIŞ (RETROAKTİF KAPATILAMAZ) / OWNER ATTRIBUTION = UNATTRIBUTED

IMPLEMENTATION AUTHORITY: NONE — bu kayıt hiçbir yeni yetki üretmez.
```
