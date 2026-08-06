# ARC-07 I08 Legacy-Flat Reduction — Kullanım (E4)

Guarded-apply konvansiyonu (bkz. runbooks/guarded-apply-script-convention.md; K1 deseni).

## Dry-run (varsayılan; yazım YOK)
```bash
cd project/apps/api
pnpm exec ts-node scripts/arc07-i08-legacy-flat-reduction.ts [--tenant <id>]
```
Çıktı: BEFORE sayaçları (BOS/ESIT/FARKLI/YALNIZ_FLAT/YALNIZ_RELATIONAL), eligible/conflict.
FARKLI veya YALNIZ_FLAT > 0 → FAIL-CLOSED (exit 2); apply hiç açılmaz.

## Apply (ÜÇ KAPI + loopback DB zorunlu)
```bash
pnpm exec ts-node scripts/arc07-i08-legacy-flat-reduction.ts \
  --apply --allow-db-write --confirm-i08-reviewed [--tenant <id>]
```
Ön koşullar: fresh doğrulanmış backup + CLIENT mutation freeze (C2-I08 gate kaydı).
Davranış: tenant-bounded ayrı $transaction; koşullu yazım (yalnız hâlâ flat taşıyan
satır); satır başına AuditLog (alan ADLARI, ham değer YOK); audit hatası → rollback;
AFTER sayaç + after-verify (ESIT/YALNIZ_FLAT/FARKLI=0 beklenir, aksi exit 4).
PII: hiçbir çıktı ham adres değeri basmaz; hatalarda connection string maskelenir.
