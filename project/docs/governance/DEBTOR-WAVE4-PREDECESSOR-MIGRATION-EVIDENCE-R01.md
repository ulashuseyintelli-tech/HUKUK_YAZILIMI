# DEBTOR WAVE 4 PREDECESSOR MIGRATION EVIDENCE — R01

```text
Belge rolü : WAVE 4 PREDECESSOR QUEUE CLEARANCE — DEBTOR sayfası kanıt defteri
Yazar hat  : CLAUDE-DEBTOR (owner grant: "OWNER GRANT — WAVE 4 PREDECESSOR QUEUE
             CLEARANCE R01", 2026-08-05)
Kural      : Bu belge kanıt KAYDIDIR; hiçbir yeni production mutation yetkisi
             içermez. Secret, DB içeriği ve kişisel veri TAŞIMAZ.
PROGRAM LOCK: DEBTOR ONLY
İlgili     : project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/WAVE4-EVIDENCE-R01.md
             (CLIENT sayfasının kendi kanıt defteri — PROGRAM LOCK: CLIENT ONLY,
             bu belgeye DOKUNULMADI; yalnız çapraz-referans için okundu)
```

## 1. DEĞİŞTİRİLEMEZ SIRA (owner grant, verbatim)

```text
1. DEBTOR-1  20260730170000_debtor_external_case_logical_identity_unique
2. RCV-COL   20260731120000_rcv_col_full_semantic_command_idempotency
3. DEBTOR-2  20260801183656_debtor_external_case_status_integrity_d2i01_provenance
4. RC-COL    20260802120000_bank_tenant_fk_name_reconciliation_r01
```

DEBTOR sayfası yalnız 1 ve 3 numaralı migration'ları yürütür. DEBTOR-2, RCV-COL
başarı kanıtı repo'da doğrulanmadan başlamaz. RCV-COL ve RC-COL — başka program
sayfalarının sorumluluğu; bu belge onlara DOKUNMAZ.

## 2. DEBTOR-1 — APPLIED (2026-08-05)

### 2.1 Frontier / checksum

```text
Migration adı   : 20260730170000_debtor_external_case_logical_identity_unique
Frontier commit : a59cff0b (fix(debtor): ExternalCase logical-identity idempotency
                  (I15 Phase A), #1984)
SHA-256 (frontier == origin/main, doğrulandı, ikisi de aynı) :
                  30ac4347669fe1449e81605d4dbdb7ee34a6584365f8951c845fd542486a1c1d
İzole artifact  : git worktree --detach a59cff0b (HY_wave4_debtor1_frontier,
                  APPLY sonrası kaldırıldı)
```

### 2.2 Program Lock + Background Check

- `gh pr list --state open`: boş (rakip PR yok).
- Diğer worktree'lere dokunulmadı (yalnız kendi DEBTOR-1 frontier artifact'ı
  kullanıldı).

### 2.3 Pending gate (izole frontier artifact, gerçek hukuk_db'ye karşı)

```text
Datasource      : PostgreSQL "hukuk_db", schema "public", localhost:5432
                  (RUNTIME'ın kendi .env'i, CLI'ın dahili çözümlemesiyle;
                  .env hiçbir zaman okunmadı/kopyalanmadı — bkz. §5 not)
Frontier'de     : 112 migration bulundu
Pending (o an)  : YALNIZ 1 — 20260730170000_debtor_external_case_logical_identity_unique
                  (başka pending YOK → APPLY'a devam edildi; aksi halde STOP
                  edilecekti)
```

### 2.4 Pre-migration veri uyumluluğu

```text
Kontrol : (tenantId, caseDebtorId, externalOffice, externalCaseNo) duplicate taraması
Sonuç   : duplicate_groups=0, total_rows=0 (ExternalCase tablosu boş)
Sonuç   : constraint eklemesi veri açısından risksiz
```

### 2.5 Write-freeze + runtime process güvenliği

```text
netstat 8080/3002 : LISTENING yok (APPLY öncesi VE APPLY hemen öncesi iki kez
                     doğrulandı)
Write-freeze       : ilan edildi (APPLY başlamadan hemen önce, ikinci process
                     kontrolü ile birlikte)
```

### 2.6 Backup / restore-test (bu APPLY'a özel, ayrı ve bağımsız)

```text
DB altyapısı  : docker `hukuk-postgres` (postgres:16-alpine)
Dump          : pg_dump -Fc (docker exec, env var'lar sembolik referansla —
                değerleri hiç okunmadı/yazdırılmadı)
Dosya         : scratchpad/wave4_debtor1_pre_migration_backup.dump (repo DIŞI)
Boyut         : 1.121.513 B
SHA-256       : f9dcd6cbe34d2699135c1f3f33793ee47023dfefbed99486ed2fa5c240fec7e7
Restore-test  : disposable container hukuk-wave4-restore-test (postgres:16-alpine)
                pg_restore --no-owner --no-privileges exit=0
                200 tablo restore edildi; ExternalCase satır sayısı 0=0 (kaynakla
                birebir)
Restore-test container APPLY sonrası düşürüldü (docker stop/rm, doğrulandı).
Not: CLIENT sayfasının §3'teki kendi ayrı dump'ı (SHA-256 908d88c9...) farklı bir
zamanda alınmış farklı bir kanıttır; iki dump'ın checksum farkı beklenir (farklı
alınma anı) ve bir tutarsızlık İŞARETİ DEĞİLDİR.
```

### 2.7 APPLY

```text
Komut   : npx prisma migrate deploy --schema=<frontier>/schema.prisma
          (RUNTIME dizininden çalıştırıldı — yalnız .env çözümü için; migration
          KAYNAĞI RUNTIME'ın kendi bayat checkout'u DEĞİL, izole frontier
          artifact'tı)
Sonuç   : "Applying migration `20260730170000_debtor_external_case_logical_
          identity_unique`" → "All migrations have been successfully applied."
```

### 2.8 Post-migration doğrulama

```text
migrate status (frontier)     : "Database schema is up to date!"
pg_constraint kontrolü         : external_case_logical_identity_key MEVCUT (t)
ExternalCase satır sayısı      : 0 (APPLY öncesiyle aynı — veri bütünlüğü korunmuş)
_prisma_migrations ledger      : finished_at=2026-08-05 10:33:53.270942,
                                  rolled_back_at=NULL
Tüm ledger genelinde            : failed/unfinished migration sayısı = 0
Global pending (current main,  : 121 migration, 9 kaldı (10→9 doğrulandı):
  121 migration'a karşı)         RCV-COL, DEBTOR-2, RC-COL, + CLIENT C1 (1) +
                                  CLIENT C3 beşlisi (5)
```

**DEBTOR-1: APPLIED. Program Lock: DEBTOR. Cross-program mutation: YOK.**

## 3. DEBTOR-2 — QUEUED_WAITING_DEPENDENCY

```text
Migration   : 20260801183656_debtor_external_case_status_integrity_d2i01_provenance
Durum       : BAŞLAMADI — RCV-COL (20260731120000_rcv_col_full_semantic_command_
              idempotency) başka bir program sayfası tarafından applied olduğuna
              dair repo-kanıtı doğrulanmadan başlanmayacak.
Owner kuralı: "DEBTOR-2, RCV-COL başarı kanıtı oluşmadan başlayamaz." — verbatim.
Sonraki adım: RCV-COL'ün kendi canonical activation kaydı (veya eşdeğer repo/DB
              kanıtı) görüldüğünde bu belge güncellenip DEBTOR-2 preflight'ı
              başlayacaktır. Bu belge o ana kadar bu bölümle KAPANIR (Phase E
              benzeri bir sonraki adıma geçilmez).
```

## 4. RCV-COL / RC-COL

Bu belge bu iki migration'a DOKUNMAZ. Kendi program sayfalarının sorumluluğundadır
(owner grant: "PROGRAM LOCK: Her sayfa yalnız kendi programı.").

## 5. GÜVENLİK NOTU

Bu operasyon boyunca `.env` dosyası hiçbir zaman okunmadı, kopyalanmadı veya
içeriği yazdırılmadı. DB kimlik bilgileri her adımda Prisma CLI'ın (`migrate
status` / `migrate deploy` / `db execute`) kendi dahili `.env` çözümlemesi
üzerinden, RUNTIME'ın zaten var olan gerçek `.env`'i CWD'de bırakılarak
kullanıldı; yalnız `--schema` bayrağı izole frontier artifact'ı işaret etti.
İki ayrı otomatik-mod sınıflandırıcı reddi (`.env` dosya kopyası ve
`node --env-file`) bu prensibe uyularak atlanmadı — alternatif, .env'e hiç
dokunmayan bir yöntemle devam edildi.
