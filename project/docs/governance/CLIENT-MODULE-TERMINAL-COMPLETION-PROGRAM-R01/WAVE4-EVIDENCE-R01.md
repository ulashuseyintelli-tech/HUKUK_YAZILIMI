# WAVE 4 EVIDENCE — R01 (CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01)

```text
Belge rolü : WAVE 4 PRE-ACTIVATION kanıt defteri (owner disposition 2026-08-05)
Yazar hat  : CLAUDE-CLIENT (WAVE 4 operatörü)
Kural      : Bu belge kanıt KAYDIDIR; hiçbir production mutation yetkisi içermez.
             Secret, DB içeriği ve kişisel veri TAŞIMAZ.
PROGRAM LOCK: CLIENT ONLY
```

## 1. ADIM 0 PREFLIGHT — İLK KOŞUM (2026-08-05, gerçek hukuk_db, read-only): STOP

- `prisma migrate status`: 121 migration bulundu — **111 applied / 10 pending** (VERIFIED).
- Pending kuyruğu (değiştirilemez kronolojik sıra) ve program sahipleri:
  1. `20260730170000_debtor_external_case_logical_identity_unique` — DEBTOR (DEBTOR-1)
  2. `20260731120000_rcv_col_full_semantic_command_idempotency` — RCV-COL
  3. `20260801183656_debtor_external_case_status_integrity_d2i01_provenance` — DEBTOR (DEBTOR-2)
  4. `20260802120000_bank_tenant_fk_name_reconciliation_r01` — RC-COL
  5. `20260802190000_client_identity_active_partial_unique` — CLIENT C1
  6-10. CLIENT C3 beşlisi (aşağıda §2)
- STOP nedenleri: (a) ilk dörtlü CLIENT-DIŞI — cross-program APPLY yetkisi YOK;
  (b) backup/restore kanıtı o an yoktu (bu belge §3 ile kapandı); (c) runtime
  mutabakatı FAIL (aşağıda §4). Hiçbir production mutation yapılmadı.
- Owner disposition (2026-08-05): predecessor'lar kendi program sahiplerince, sırayla,
  yalnız kendi migration'ında biten doğrulanmış kronolojik artifact ile uygulanacak;
  current main üzerinden `prisma migrate deploy` YASAK; manuel SQL / sahte-applied /
  `migrate resolve` YASAK.

## 2. C3 MIGRATION UZLAŞTIRMASI (owner disposition m.5): KAPANDI

PR #2212 / squash `cb6695d8` — C3 activation borcu **5 migration** olarak canonical:
`20260803170000` (B01 #2149, §13/5) · `20260803190000` (B02 #2151, §13/6) ·
`20260803210000` (B03 #2152, §13/8) · `20260803230000` (B04 #2155, §13/7 —
önceki kayıtta eksikti) · `20260804010000` (B05 #2156, §13/9).

## 3. BACKUP / RESTORE PROVASI (owner disposition m.3): PASS

```text
DB altyapısı : Docker konteyneri `hukuk-postgres` (postgres:16-alpine), host 5432
Dump         : pg_dump -Fc (docker exec) → repo DIŞI
               C:/Development/HUKUK_YAZILIMI/backups/hukuk_db_20260805T085958Z.dump
               exit=0 · 1.121.513 B
               SHA-256: 908d88c9dc550b0c435587e3234e15e9091c7d20acf6cd5d6a9c5998fd915afe
İzole restore: hukuk_db_restore_proof_20260805085958 (benzersiz ad, non-production)
               createdb exit=0 · pg_restore --no-owner --no-privileges exit=0
               Production DB'ye HİÇBİR yazma yapılmadı.
Doğrulama    : Proof DB'de prisma migrate status = prod ile BİREBİR (121/10, aynı liste)
               Satır sayıları birebir: Tenant 3=3 · Client 15=15 · Case 26=26 ·
               ClientPowerOfAttorney 4=4 · AuditLog 829=829
Minimizasyon : Kanıt toplandıktan sonra proof DB düşürüldü (dropdb exit=0; pg_database=0)
KURAL        : İlk production mutation ÖNCESİ dump TAZELENİR; iş tek kesintisiz
               write-freeze penceresinde bitmezse backup yeniden tazelenir.
```

## 4. RUNTIME DURUMU

- `HY_WT/RUNTIME` worktree HEAD `3c73708d` (#1849 OFFICE dönemi) + 10 dirty dosya —
  owner kararıyla deployment kaynağı olarak **REDDEDİLDİ**; dokunulmadı, temizlenmedi.
- Production deployment YALNIZ §5'teki immutable artifact'tan yapılacaktır.
- DB APPLY ile runtime deployment ayrı pencerelerde ilerleyebilir; runtime deployment +
  gerçek runtime doğrulaması olmadan WAVE 4 KAPANAMAZ.

## 5. CLEAN RELEASE ARTIFACT MANIFEST (owner assignment, GO-COMPLETE)

```text
KAYNAK
  Git SHA                : 7428d6888bcfbbed477ca463ed399daf6ac6f457 (fresh canonical main)
  Worktree               : izole, temiz (fresh checkout; HY_WT/RUNTIME KULLANILMADI)
  Lockfile SHA-256       : af0e81e795a958ac28d227fbde3a4af2029bd42e0403dd6c36e7067acb051514
                           (pnpm-lock.yaml; install --frozen-lockfile exit=0)
  Source-manifest SHA-256: 5b26aa347040273464bec89ffeaa2bc5b771555f6c8f6a1c21be96474beb03c5
                           (yöntem: `git ls-tree -r HEAD | sha256sum` — tüm blob'lar)

BUILD
  Prisma generate        : PASS (v5.22.0)
  API  (nest build)      : exit=0 → apps/api/dist (main.js mevcut)
  WEB  (next build)      : exit=0 → apps/web/.next · BUILD_ID EKLhnQ1p7w7g80kmnQior
  API dist SHA-256       : 335b1d673d63ac98bd961f6a85883f12e989a9347c1cc4c97a1e88309b50da06
  WEB .next SHA-256      : 9ddf06abfac086086b39817b234703f81c6754528b56a30b7a101bc4776f195c
                           (cache hariç; yöntem: find|sort|sha256sum|sha256sum)

TEST
  client modülü          : 42 suite / 706 test PASS (bu worktree'de, bu SHA'da)

ARTIFACT (immutable)
  Dosya                  : C:/Development/HUKUK_YAZILIMI/releases/client-wave4-7428d688.tar.gz
                           (repo DIŞI; içerik: apps/api/dist + apps/api/prisma +
                           apps/web/.next[cache'siz] + pnpm-lock.yaml; 244 migration girdisi)
  Boyut                  : 6.049.388 B
  SHA-256                : a4e01e192aa590fa8ae5910d5654f2beebb99daf1fc51f4a81fff05eecbde19f
  İçinde secret/DB verisi/kişisel veri YOKTUR (yalnız derleme çıktısı + şema/migration + lockfile).
```

## 6. SONRAKİ DURUM

```text
PARALLEL NEXT : (bu belgeyle KAPANDI) clean release artifact hazırlığı
SERIAL NEXT   : DEBTOR-1 → RCV-COL → DEBTOR-2 → RC-COL (kendi program sahiplerince)
SONRA         : ADIM 0 re-run (gerçek hukuk_db) → tamamen PASS ise ratifiye sıra
                (1A C1 → 1B C3 → 2 X2 → 3 C2 → 4 K7.4) yeni owner GO İSTENMEDEN devam
CLIENT PRODUCTION APPLY: NOT YET PERMITTED
```

---

# EK — R02: WAVE 4 EXECUTION EVIDENCE (2026-08-05/06, owner GO-COMPLETE resume)

## 7. ADIM 0 FRESH RE-RUN: PASS

```text
Fresh main        : e78b835b (owner final canonical a70a47b4 ancestor — VERIFIED)
Competing executor: 0 açık PR
hukuk_db          : 115 applied / 6 pending / 0 failed — altısı da CLIENT
                    (C1 identity + C3 beşlisi, exact adlarla doğrulandı)
Artifact geçerliliği: 7428d688..e78b835b build-affecting diff = 0 (yalnız governance
                    docs + control-plane scripts) → artifact KULLANILDI, yeniden üretilmedi
Envanterler       : dup(tckn)=0 grup · dup(vkn)=0 grup · K5.5 etki ön-sayımı=15 satır ·
                    K9.5: 15 client / 15 flat-canCollect / 13'ü geçerli POA'sız
                    (grandfathering YOK — aktivasyonla fail-closed kaldılar)
Anahtar           : CLIENT_SPECIAL_CATEGORY_DATA_KEY hedef ortamda YOKTU (1B'de üretildi)
```

## 8. ADIM 1 — CLIENT MIGRATIONS: PASS

```text
Write-freeze      : DECLARED (300x listener=0; pg_stat_activity aktif yazar=0)
Fresh dump        : hukuk_db_20260805T220359Z.dump · exit 0 · 1.125.347 B ·
                    sha256 9aba6de01f68954eaf29eb3d9ee5e27d68b4a9b8c894956aa238a96350284d7a
İzole restore     : createdb+pg_restore exit 0 · Client=15 doğrulandı · proof DB düşürüldü
APPLY             : prisma migrate deploy — 6 migration, timestamp sırasıyla,
                    "All migrations have been successfully applied";
                    manuel SQL YOK, resolve YOK
Son durum         : 121 applied / 0 pending / 0 failed ("Database schema is up to date!")
Doğrulama         : C1 partial-unique 2/2 index MEVCUT + davranış kanıtı (tx-içi duplicate
                    probe → "Client_tenantId_tckn_active_unique" ihlali, ROLLBACK) ·
                    C3 6/6 tablo MEVCUT · 4/4 default=false ·
                    K5.5 pre=15 → post=0 (ratifiye hedef kümeyle birebir) ·
                    çekirdek sayımlar değişmedi (Tenant 3 · Client 15 · Case 26 · POA 4 ·
                    AuditLog 829)
ADIM 1B           : CLIENT_SPECIAL_CATEGORY_DATA_KEY güvenli rastgele (32B) üretildi,
                    hedef ortam .env'ine yazıldı — değer hiçbir log/PR/kanıta GEÇMEDİ;
                    .env yedeği alındı. Yedekleme/rotasyon sorumluluğu: owner/ops.
```

## 9. ADIM 2 — CLEAN RUNTIME: PASS

```text
Deploy kaynağı    : YALNIZ immutable artifact client-wave4-7428d688.tar.gz
                    (sha256 a4e01e19... — merge sonrası yeniden hash: birebir)
Runtime dizini    : HY_WT/RUNTIME_W4 (pinli 7428d688 checkout + artifact overlay);
                    dirty HY_WT/RUNTIME'a DOKUNULMADI
Hash mutabakatı   : source-manifest birebir · API dist birebir · WEB .next birebir → PASS
Smoke             : API Nest started, POST /api/auth/login boş gövde → 400 (validation
                    canlı, fail-closed) · WEB GET / → 200
DB-gated (gerçek Postgres, İZOLE migrated kopya — production kirletilmedi):
  CLIENT kapsamı seri: FD e2e 6/6 · password-reset 9/9 · poa-tenant-safety 14/14 ·
  core-user-journeys 44/44 → 73/73 PASS
  Geniş sweep 78 suite: 66 PASS / 12 FAIL — A/B deneyi (aynı dump, CLIENT
  migration'sız kopya) AYNI çekirdek FAIL kümesini + fazlasını verdi → FAIL'ler
  pre-existing/ortamsal (temiz-izole CI DB varsayımı + paralel koşum çakışması);
  CLIENT suite FAIL'i SIFIR. FOLLOW-UP: cross-modül db-gated izolasyon disiplini
  (CLIENT programı dışı).
  (client-workspace.live.spec.ts artık repo'da yok — tarihî referans, N/A.)
Test DB'leri kanıt sonrası düşürüldü (KVKK minimizasyonu).
```

## 10. ADIM 3 — X2 FD ACTIVATION: EXECUTED (dışa yayın ops-pending)

```text
Flag'ler          : CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED=true +
                    CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED=true
                    (canonical + runtime env; API bu env ile yeniden başlatıldı)
Provider allowlist: Kanonik kod-seviyesi guard (smtp/sendgrid/ses EXACT — §35.10)
                    AKTİF. EMAIL_PROVIDER yapılandırılmadığı için provider='mock' →
                    dışa e-posta yayını YAPISAL olarak fail-closed (hatalı yayın
                    imkânsız). GERÇEK provider konfigürasyonu OPS/OWNER kalemi.
Canary            : tokensiz FD aksiyon rotaları (publish, request-office-approval)
                    → 401 (yetkisiz erişim RED); FD davranışı gerçek Postgres'te
                    6/6 (e2e). Hatalı yayın/yetkisiz erişim gözlenmedi → flags ON kaldı.
```

## 11. ADIM 4 — C2 ARC-07: I05 PASS · I06 PASS · **I08 STOP (kanonik çelişki)**

```text
I05 DRY-RUN (provenance: hukuk_db, 20260806T060731Z, main e78b835b):
  aktif client=8 · flat-adres dolu=3 · ClientAddress=0 satır ·
  kova: eşit=0 / farklı=0 / yalnız-flat(genis predicate)=3 / yalnız-relational=0 ·
  çok-primary ihlali=0 (beklenen 0 ✓) · isPrimary&&!isCurrent=0 (beklenen 0 ✓)
  → kabul kriterleri PASS (conflict kovası boş; apply seti net)
I06 APPLY:
  Öncesi taze dump: hukuk_db_20260806T*_pre_i06.dump (sha256 366ea4365f60d805...)
  Tek transaction, satır-bazlı idempotent-eligibility INSERT (yalnız-flat kovası);
  id provenance: 'arc07i06-'||clientId (D04) · INSERT 3 satır · COMMIT
  Post: ClientAddress=3 (3/3 arc07i06) · kalan yalnız-flat=0 · ihlaller 0/0 ·
  Client=15 değişmedi · flat alanlara DOKUNULMADI (Stage 1 kaynak otorite korunur)
I08 LEGACY-FLAT REDUCTION: **YÜRÜTÜLMEDİ — STOP.**
  Kanonik çelişki (charter §49.6/§49.14, repository-truth): D05 Stage-3 hükmü —
  legacy-flat azaltımı YALNIZ tüketici hazırlığı KANITLANDIKTAN sonra; I07 kanıtın
  PARÇASIDIR, TAMAMI DEĞİLDİR (flat YAZIM hâlâ devam ediyor — VER-02 create/update).
  Ayrıca repo'da I08 yürütücüsü YOK: yürütmek yeni ürün-kodu engineering'i gerektirir
  (C2 engineering FROZEN; WAVE-4 data-window yetkisi ürün diff'i kapsamaz).
  → Owner talimatı ("I08 yürüt") ile kanonik kapı çelişiyor; governance kuralı gereği
  çelişki RAPORLANDI, sessizce taraf SEÇİLMEDİ. OWNER DECISION REQUIRED.
```

## 12. ADIM 5 — K7.4 READ-ONLY ENVANTER: PASS (mutation YOK, yalnız agregat)

```text
20260806T060859Z: Client.notes dolu=0/15 (client-notes yoluyla mevcut md.6 riski YOK) ·
ClientSpecialCategoryRecord=0 · DSAR=0 · Consent=0 · LegalHold=0 (yeni tablolar boş —
beklenen). CROSS-DOMAIN GÖZLEM: Case.notes dolu=2 — Case retention CLIENT owner'ı
değildir; WAVE 5 terminal sertifikasyon girdisine not edildi. Ham veri/sınıflandırma
üretilmedi.
```

## 13. WAVE 4 SONUÇ DURUMU

```text
C1-PROD-ACTIVATION : EXECUTED / CLOSED (identity migration APPLIED + davranış kanıtlı)
C3-PROD-ACTIVATION : EXECUTED / CLOSED (5 migration APPLIED + K9.5 raporu + K7.3 anahtar
                     + K7.4 tarama; 13 POA'sız client fail-closed — grandfathering YOK)
X2 FD ACTIVATION   : EXECUTED (flags ON + canary PASS); dışa e-posta = EMAIL_PROVIDER
                     ops konfigürasyonuna kadar yapısal fail-closed (OPS FOLLOW-UP)
C2-PROD-ACTIVATION : PARTIAL — I05+I06 EXECUTED; I08 STOP (kanonik çelişki, owner kararı)
WAVE 4             : **PRODUCTION_ACTIVE İLAN EDİLMEDİ** — "IF ALL PASS" koşulu I08
                     nedeniyle sağlanmadı. Kalan: I08 owner disposition + EMAIL_PROVIDER
                     ops. Runtime: API 8080 (flags ON) + Web 3002 artifact'tan AYAKTA.
WAVE 5             : I08 disposition sonrası NEXT ELIGIBLE.
```
