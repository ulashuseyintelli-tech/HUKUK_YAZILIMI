# Cross-Workstream Migration Execution Contract

```text
Belge yolu : project/docs/governance/cross-workstream-migration-execution-contract.md
Durum      : CANONICAL PROCEDURE / OPERATIONAL CONTRACT — kuruluş 2026-07-23
             (CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02-EXECUTION-CONTRACT)
Rol        : Birden fazla bounded-context'in migration'ının aynı `prisma migrate deploy`
             kuyruğunda toplandığı HERHANGİ bir gelecekteki cross-workstream migration
             train'i için tekrar kullanılabilir, train-bağımsız, fail-closed prosedür.
             Bu belge kendisi hiçbir migration çalıştırmaz, hiçbir owner yetkisi
             ÜRETMEZ; yalnız gelecekteki bir GO-MIGRATE'in izlemesi gereken adımları
             ve GO-MIGRATE'in kendisinin nasıl doğrulanacağını tanımlar.
```

## 0. Bu belge ile register arasındaki ilişki

`pending-migration-coordination-register.md` **LIVING / NON-NORMATIVE COORDINATION
SURFACE**'tir — hangi migration'ın hangi workstream'e ait olduğunu, hangi owner
yetkisini beklediğini ve (icra edilmişse) hangi kanıtla kapandığını kaydeder. Bu
belge ONUN YERİNE GEÇMEZ ve register'ın §7-§17 arasındaki hiçbir bölümünü
**yeniden yazmaz**. İlişki şudur:

```text
Register (§7-§17)          : "Bu spesifik train'de NE oldu, HANGİ SHA'da, HANGİ tarihte"
                              (instance-level, tarihsel, salt kayıt)
Bu belge                    : "Herhangi bir gelecekteki train NASIL yapılır"
                              (reusable, train-bağımsız, prosedür)
```

Bu belge, register'ın §15 (GO-ANALYZE freshness-check + rehearsal), §16 (canlı
icra kapanışı) ve §17'sindeki (M2 CI-coverage kapanışı) **fiilen doğrulanmış
ampirik kanıttan** çıkarılmıştır — TRAIN-R02, bu belgedeki kuralların ilk tam
uygulamasıdır. TRAIN-R02'ye özgü tarih/SHA/PR-numarası detayları register'da
kalır; burada yalnız §10 "Precedent" bölümünde işaret olarak anılır.

## 1. Kapsam ve otorite sınırı

Bu belge **docs-only**'dir. Kendisi:

- Hiçbir migration'ı yetkilendirmez veya uygulamaz.
- Hiçbir runtime değişikliği yetkilendirmez.
- `pending-migration-coordination-register.md`'nin mevcut disposition'larını
  DEĞİŞTİRMEZ (tüm migration'lar bu belgenin yayınlandığı anda, kendi register
  girişlerinde ne yazıyorsa o durumda kalır).

Bir gelecekteki cross-workstream migration train'i bu belgeyi izlemeye
başlamadan önce, **§8 Authority Matrix**'teki ilgili GO-* yetkisinin owner
tarafından açıkça verilmiş olması gerekir. Bu belgenin varlığı kendi başına
hiçbir GO-* yetkisi ima etmez.

---

## 2. ENTRY GATES

Bir migration train'i icra için değerlendirilmeye alınmadan önce, hepsi ayrı
ayrı ve taze doğrulanır:

1. **Fresh `origin/main` SHA** — `git fetch --all --prune` + `git rev-parse
   origin/main`; konuşma hafızasındaki veya önceki bir oturumdaki SHA otorite
   sayılmaz.
2. **Exact pending migration inventory** — `prisma migrate status` VE doğrudan
   `prisma/migrations/` dizin listesi çapraz kontrolü (yalnız birine güvenme;
   TRAIN-R02'de register'ın kendi ilk tespiti "4 migration" derken gerçek
   sayı "8" çıkmıştı — bu, salt CLI çıktısına güvenmenin risk taşıdığının
   kanıtıdır, her ikisi de bağımsız doğrulanmalıdır).
3. **Prisma folder-order doğrulaması** — `prisma migrate deploy`'un migration'ları
   HER ZAMAN klasör-adı (timestamp) lexical sırasıyla, topluca ve seçici
   olmayan biçimde uyguladığı yeniden teyit edilir. **Gerçek kronolojik merge
   sırası klasör sırasından FARKLI olabilir** (register §15.2, TRAIN-R02'de
   M3↔M4 ve M5↔M6 arasında ampirik olarak doğrulanmış bir örnek) — bu fark
   şema-seviyesinde zararsız olabilir ama eğer icra planı "her migration'ı
   kendi ilk-merge SHA'sına anchor'la" yöntemini kullanacaksa, anchor'lar
   GERÇEK kronolojik sırayla ziyaret edilmelidir; aksi halde bir migration'ın
   kendi anchor'ı başka bir workstream'in migration'ını sessizce içerebilir.
4. **Cross-workstream ownership classification** — her migration için: hangi
   program/bounded-context sahibi, hangi PR/SHA ile merge edildi, hangi
   tablo/enum/index/FK/trigger'a dokunuyor, başka bir pending migration ile
   gerçek şema bağımlılığı (FK/paylaşılan tablo) var mı yoksa yalnız
   folder-order'da yan yana mı duruyor.
5. **Her migration için implementation + CI + governance readiness** — migration'ın
   kendi PR'ı merge edilmiş mi, kendi testleri gerçekten required CI'da
   çalışıyor mu (bkz. §4.5 — yalnız "test dosyası var" yeterli değildir),
   register'da bir girişi var mı (yoksa bu train'in kendisi, register'ın
   izin verdiği "eksik giriş ekleme" kapsamında bir tane açabilir, ama bu
   READY/GO anlamına gelmez).
6. **Competing migration/PR/worktree taraması** — açık PR'lar, aynı isimli/yakın
   worktree'ler, aynı migration dizinine veya `ci.yml`'e dokunan başka bir
   aktif dal salt-okuma taranır.
7. **Explicit owner ratification** — **KRİTİK KURAL** (TRAIN-R02
   POST-EXECUTION-RECONCILIATION-R01'in kendi bulgusundan doğrudan
   çıkarılmıştır): owner ratifikasyonu, icrayı yapacak/yapmış ajanın kendi
   commit mesajı, PR body'si veya kendi raporu ile **KANITLANMIŞ SAYILMAZ**.
   Yeterli kanıt yalnız şunlardan biridir: (a) sohbette owner'ın birebir
   alıntılanabilir açık yetki cümlesi, (b) `decision-log.md`'de ayrı, owner
   tarafından yazılmış/onaylanmış bir karar kaydı, (c) register'ın kendi
   GATE şablonunda owner'ın doldurduğu bir GO-MIGRATE bloğu. Bunlardan biri
   yoksa disposition **AUTHORITY EVIDENCE: NOT FOUND**'dur ve icra
   başlayamaz — "yetkisiz" denemez, ama "kanıtlanmış" da denemez.

## 3. PRE-EXECUTION GATES

Entry gate'lerin hepsi geçtikten VE owner ratifikasyonu §2.7'nin standardını
karşıladıktan sonra, icradan hemen önce:

1. **Verified backup** — `pg_dump -Fc`, SHA-256 checksum hesaplanır ve
   kaydedilir.
2. **Disposable restore test** — checksum'lı backup, **disposable** (izole,
   tek-kullanımlık, iş bitince imha edilen) bir Postgres konteynerine geri
   yüklenir; en az kritik tablo satır sayıları ve toplam migration/tablo
   sayısı gibi somut invariant'lar karşılaştırılır. Gerçek `hukuk_db`'ye asla
   restore denemesi yapılmaz (bkz. §5 Failure/Rollback).
3. **Full migration rehearsal** — tam canonical migration geçmişi + train'in
   tüm pending kuyruğu, disposable bir Postgres'te, mevcut `main`'in
   `prisma/migrations` dizininden tek bir `prisma migrate deploy` ile
   uygulanır; `_prisma_migrations` sonucu (`applied_steps_count`,
   `rolled_back_at`, `finished_at`) her migration için ayrı doğrulanır.
4. **Required domain tests** — train'e giren HER programın kendi ilgili test
   paketi (unit + disposable-DB) çalıştırılır.
5. **CI durumu** — mevcut owner-tanımlı hard-gate zinciri (görev anında kaç
   ve hangi job'lar olduğu **taze doğrulanır**, isim/sayı sabit varsayılmaz)
   terminal `SUCCESS` olmalıdır; `CANCELLED`/`SKIPPED`/`NEUTRAL`/
   `IN_PROGRESS`/`QUEUED` PASS sayılmaz. **Ayrıca**: GitHub'ın gerçek branch
   protection required-status-check listesi (`gh api .../branches/main/
   protection`) CI job isimleriyle **KARIŞTIRILMAZ** — TRAIN-R02'de bağımsız
   üç kez doğrulanmış bir bulgu olarak, bu repo'da platform-seviyesinde
   zorunlu kılınan tek check `"Web Tests (vitest)"`dir; diğer job'lar
   script-seviyesinde `exit 1` yapar ama GitHub'ın kendisi onları merge için
   şart koşmaz. Bu, owner'ın kendi ek hard-gate'ini (§3.5'in başındaki
   "owner-tanımlı") geçersiz kılmaz — yalnız hangi katmanın gerçekten neyi
   garanti ettiğinin karıştırılmaması gerektiğini kaydeder.
6. **Maintenance/write freeze** — ilgili yazma yollarının (API, cron, worker)
   durdurulacağı bir bakım penceresi ilan edilir.
7. **Writer/process inventory** — **PID-doğrulanmış** port sahipliği ile (ör.
   `Get-NetTCPConnection` → `OwningProcess`), yalnız komut-satırı metin
   eşleşmesiyle DEĞİL — aynı görünen birden fazla node süreci farklı
   worktree'lerden veya farklı build modlarından (dev-watch vs compiled dist)
   çalışıyor olabilir; yalnız gerçekten portu sahiplenen süreç canlı yazıcıdır.
8. **Active transaction and lock drain** — hedef DB'de bekleyen kilit ve açık
   transaction sayısının sıfıra indiği doğrulanır.
9. **Frozen execution SHA** — icra edilecek tam commit SHA'sı dondurulur;
   deploy anından hemen önce drift olmadığı yeniden doğrulanır.

## 4. EXECUTION

- **Tek canonical runner**: `prisma migrate deploy`. Başka hiçbir yol
  kullanılmaz.
- **Seçici migration uygulaması YOK** — Prisma'nın doğası gereği bu zaten
  mümkün değildir; bir alt kümeyi "yalnız uygulamak" isteyen hiçbir yöntem
  (dosya taşıma, geçici silme, vb.) denenmez.
- **Manuel SQL apply YOK.**
- **Migration reorder YOK** (klasör adları değiştirilmez).
- **`_prisma_migrations` tablosuna manuel mutation YOK.**
- **`migrate resolve` fiction YOK** (gerçekte uygulanmamış bir migration'ı
  "uygulandı" olarak işaretlemek yasaktır).
- **Sıralama kuralı**: DB migration'ı, yeni şema elemanlarını tüketen HERHANGİ
  bir runtime deploy'undan ÖNCE veya onunla AYNI kontrollü pencerede
  uygulanır — asla sonra. Gerekçe (TRAIN-R02 register §15.7'nin kendi
  bulgusu): saf additive migration'lar için "DB kod'dan önde" durumu
  güvenlidir (eski kod yeni elemanı hiç görmez), ama "kod DB'den önde" durumu
  DEĞİLDİR — yeni koddaki bir okuma/yazma yolu (ör. bir retention cron'u) DB
  henüz migrate edilmemişken devreye girerse sessizce (yakalanmış exception,
  crash yok ama işlevsiz) başarısız olabilir.

## 5. POST-EXECUTION

1. **Migration table verification** — train'deki HER migration için
   `_prisma_migrations` satırı ayrı ayrı: `applied_steps_count=1`,
   `rolled_back_at` boş, `finished_at` dolu.
2. **Schema/index/FK/CHECK introspection** — "migrate deploy başarılı çıktı
   verdi" yeterli kanıt DEĞİLDİR; her migration'ın ürettiği tablo/kolon/
   enum/index/FK/CHECK/trigger nesnesi doğrudan `\d`/`pg_indexes`/
   `pg_constraint` ile TEK TEK doğrulanır.
3. **Row-count/invariant karşılaştırması** — backup öncesi ile deploy sonrası
   satır sayıları birebir eşleşir (additive migration'larda beklenen budur);
   herhangi bir fark açıklanmadan kapatılamaz.
4. **Runtime compatibility kontrolü** — o an çalışan runtime'ın pinlendiği
   commit SHA'sının, train'deki migration'ların yeni şema elemanlarını
   tüketen HERHANGİ bir koda sahip olup olmadığı `git merge-base
   --is-ancestor` ile doğrudan kontrol edilir (varsayılmaz).
5. **API/Web/cron smoke matrix** — train'e giren HER programın (ör. UYAP/
   OFFICE/CORE DEBTOR/POLICY ENGINE/RECEIVABLE) en az bir temsili smoke
   kontrolü; ortak (SHARED) kontroller (API/Web boot, tenant-isolation,
   satır-sayısı driftsizliği) ayrıca.
6. **Writer reactivation** — durdurulan yazıcı süreçler yeniden başlatılır.
7. **Maintenance removal** — bakım penceresi kaldırılır.
8. **Governance closure evidence** — bu icra için ayrı, docs-only bir kapanış
   kaydı (register'a yeni bir §, mevcut §16/§17 formatı ile aynı üslupta)
   yazılır; mevcut hiçbir bölüm yeniden yazılmaz (append-only).

## 6. FAILURE / ROLLBACK

- **Varsayılan strateji: forward-fix.** Yarım kalmış veya hatalı bir migration
  geriye alınmaya çalışılmaz; düzeltme yeni bir migration ile ileri yönde
  yapılır.
- **Ad hoc schema rollback YOK.**
- **Partial migration durumunda fail-closed**: `_prisma_migrations`'da
  `finished_at IS NULL` veya `rolled_back_at IS NOT NULL` görülürse icra
  DURDURULUR; devam etmeye veya "bitirmeye" çalışılmaz.
- **Runtime restart veya deploy otomatik yapılmaz** — bir migration
  hatasından sonra runtime'a dokunmak ayrı bir karar gerektirir.
- **Owner escalation ve incident classification zorunludur** — hata, sessizce
  "bir sonraki denemede düzelir" varsayımıyla geçilmez.
- **Backup restore YALNIZ açık owner disaster-recovery yetkisiyle** — bu,
  §3.2'deki rutin disposable-restore-testinden TAMAMEN AYRIDIR; gerçek
  `hukuk_db`'ye bir restore, rutin bir GO-MIGRATE'in zımni bir parçası
  olamaz, kendi ayrı owner yetkisini gerektirir.

## 7. Naming/versioning uyarısı (gelecekteki train'ler için)

TRAIN-R02'nin kendi kanıtı: bu contract'ın §2.3'te tarif ettiği "gerçek
kronolojik sıra ≠ klasör sırası" fark her zaman ortaya çıkmayabilir, ama
çıktığında yalnız §2.3'ün kendisi bunu YAKALAR — bir gelecekteki train bu
kontrolü ATLARSA fark fark edilmeden kalabilir. Bu yüzden §2.3, her train'de
(fark geçmişte hiç olmasa bile) tekrar çalıştırılan bir kontrol olarak kalır,
"bir kereye mahsus keşfedildi, artık gerek yok" varsayılmaz.

## 8. AUTHORITY MATRIX

| Yetki | Kapsam | Mutasyon izni |
|---|---|---|
| **GO-ANALYZE** | Sınıflandırma, freshness-check, rehearsal PLANLAMASI | Sıfır — canlı DB/runtime/git mutasyonu YOK; register'a yalnız eksik-giriş-ekleme/bayat-durum-düzeltme türünde analiz kaydı EKLENEBİLİR (owner brief'i bunu açıkça izin verirse) |
| **GO-REHEARSE** | Disposable Postgres üzerinde tam zincir rehearsal ICRASI | Yalnız disposable/tek-kullanımlık konteyner; canlı DB/runtime'a SIFIR erişim |
| **GO-MIGRATE** | Canlı DB şema mutasyonu, YALNIZ §4'teki canonical runner ile | Canlı DB şema — YALNIZ; runtime bu yetkiye DAHIL DEĞİLDİR |
| **GO-RUNTIME-CUTOVER** | Runtime'ı yeni şemayı tüketecek bir commit'e yeniden build/deploy etme | Runtime süreçleri; GO-MIGRATE'in kendisi bunu ima ETMEZ, ayrı yetki gerekir |
| **GO-ROLLBACK / DISASTER RECOVERY** | Gerçek `hukuk_db`'ye backup restore veya olay-müdahalesi | Yalnız açık, ayrı, incident-tetiklemeli owner yetkisiyle; hiçbir yukarıdaki yetki tarafından ima EDİLMEZ |
| **GO-COMPLETE governance closure** | Kapanış kaydını yazma + docs-only PR'ı merge etme | Yalnız governance dosyaları (register/bu contract); yukarıdaki hiçbir canlı-sistem yetkisini İMA ETMEZ |

Her satır bağımsızdır — bir yetkinin verilmiş olması bir üstteki veya alttaki
satırı otomatik olarak vermez.

## 9. EVIDENCE PACKET (gerçek bir icranın asgari zorunlu çıktısı)

Gerçek bir GO-MIGRATE icrası, kapanış kaydında en az şunları taşımalıdır:

- Canonical/frozen execution SHA
- Migration inventory + gerçek uygulama sırası
- Backup checksum (algoritma + değer)
- Restore verification sonucu (hangi invariant'lar, kaç tanesi eşleşti)
- Rehearsal sonucu (tam zincir, hata sayısı)
- CI sonucu (hangi job'lar, kaç tanesi PASS)
- Process/writer quiescence kanıtı (PID-seviyesinde)
- Deploy başlangıç/bitiş zaman damgaları
- Migration sonucu (`_prisma_migrations` özet — kaç satır, kaç rollback/yarım)
- Şema doğrulama sonucu (introspection, migration başına)
- Row-count/invariant karşılaştırma sonucu
- Runtime uyumluluk matrisi (program bazlı smoke sonuçları dahil)
- Final governance kapanış kaydının PR numarası ve squash SHA'sı

## 10. Precedent (referans, otorite değil)

Bu belgedeki kurallar aşağıdaki, zaten kapanmış kayıtlardan çıkarılmıştır.
Bu bölüm yalnız İŞARETTİR — aşağıdaki kayıtların kendi metni bu belge ile
DEĞİŞTİRİLMEZ:

- `pending-migration-coordination-register.md` §7-§9 — orijinal M1-M4 OFFICE
  train'i (2026-07-21/22); "gerçek kronolojik sıra ≠ klasör sırası" deseninin
  İLK keşfi.
- `pending-migration-coordination-register.md` §15 — CROSS-WORKSTREAM-LIVE-
  MIGRATION-TRAIN-R02 GO-ANALYZE freshness-check + tam zincir rehearsal
  (PR #1550).
- `pending-migration-coordination-register.md` §16 — TRAIN-R02'nin fiili
  canlı icra kapanışı (PR #1552); M1-M8, tek `prisma migrate deploy`,
  backup/restore/writer-quiescence/rehearsal/domain-test kanıtı.
- `pending-migration-coordination-register.md` §17 — M2'nin CI-coverage
  readiness-debt kapanışı (PR #1560/#1563).
- `CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R02-POST-EXECUTION-RECONCILIATION-R01`
  (bu oturumun kendi GO-INVESTIGATE bulgusu) — §2.7'nin "owner ratifikasyonu
  icra eden ajanın kendi beyanıyla kanıtlanmış sayılmaz" kuralının doğrudan
  kaynağı.

---

**IMPLEMENTATION AUTHORITY: NONE** — bu belge hiçbir migration, runtime veya
GO-OPERATE yetkisi üretmez; yalnız gelecekteki bir GO-MIGRATE'in izleyeceği
prosedürü ve o yetkinin nasıl doğrulanacağını tanımlar.
