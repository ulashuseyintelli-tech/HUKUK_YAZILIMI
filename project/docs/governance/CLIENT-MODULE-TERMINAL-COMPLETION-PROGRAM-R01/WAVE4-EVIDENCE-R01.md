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
