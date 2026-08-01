-- BANK-TENANT-FK-NAME-RECONCILIATION-R01
--
-- Amac: `BankSettlementEvidence` ve `BankTransaction` uzerindeki iki composite tenant-safe
-- foreign key'in constraint ADINI, `schema.prisma`'daki guncel `fields: [tenantId, ...]`
-- sirasiyla hizalamak.
--
-- Drift kaniti: `20260718090000_rc_col_w2_2c1_settlement_evidence_foundation` (squash
-- e7d2f11d917da3933860053acf4b7026e4057db0, COLLECTION-GOVERNANCE.md madde 10) bu iki FK'i
-- "<field>_tenantId_fkey" adiyla uretti. Fiili kolon sirasi
-- (`FOREIGN KEY ("tenantId", "<field>")`) ve `schema.prisma` fields dizisi ayni commit'ten
-- beri hep "tenantId, <field>" sirasindadir — degisen bir sey yok, yalniz Prisma'nin o
-- migration'da urettigi constraint adi bu sirayla uyusmuyordu. Bu nedenle `prisma migrate
-- dev` her ilgisiz schema degisikliginde bu iki RenameForeignKey'i tekrar tekrar onerir.
--
-- Fonksiyonel etki: SIFIR. Disposable container'da dogrulandi: rename sonrasi
-- `pg_constraint.oid` degismedi, `pg_get_constraintdef()` ciktisi (kolon sirasi, referans,
-- ON UPDATE/DELETE aksiyonu) birebir ayni kaldi; yalniz `conname` degisti.
--
-- Kapsam: YALNIZ iki RENAME CONSTRAINT. Kolon, veri, index, trigger, immutability guard'lari
-- ve `schema.prisma` DEGISMEZ (zaten guncel field sirasiyla uyumlu).

-- RenameForeignKey
ALTER TABLE "BankSettlementEvidence" RENAME CONSTRAINT "BankSettlementEvidence_supersedesEvidenceId_tenantId_fkey" TO "BankSettlementEvidence_tenantId_supersedesEvidenceId_fkey";

-- RenameForeignKey
ALTER TABLE "BankTransaction" RENAME CONSTRAINT "BankTransaction_settlementEvidenceId_tenantId_fkey" TO "BankTransaction_tenantId_settlementEvidenceId_fkey";
