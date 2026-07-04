-- TM3 Faz B-0 — client-level immutable ekstre için şema hazırlığı (yalnız nullable; index/FK/backfill YOK).
--
-- 1) ClientStatement.caseId NULLABLE: caseId=NULL → client-level ekstre (müvekkilin tüm dosyaları);
--    dolu → case-level (mevcut davranış, değişmez). Mevcut FK (ClientStatement_caseId_fkey) KORUNUR;
--    nullable kolonda FK yalnız non-null satırlarda uygulanır. Mevcut satırlar etkilenmez.
-- 2) ClientStatementLine.caseId NULLABLE EKLE: client-level ekstre satırı hangi dosyadan geldiğini taşır
--    (parent.caseId=NULL olduğunda). Scalar (FK/relation YOK — gevşek tarihsel ref). Mevcut satırlar NULL kalır.
--
-- NON-DESTRUCTIVE: veri silinmez/değiştirilmez. Backfill YOK. Unique/index YOK. Geri-uyumlu.

-- AlterTable
ALTER TABLE "ClientStatement" ALTER COLUMN "caseId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ClientStatementLine" ADD COLUMN "caseId" TEXT;
