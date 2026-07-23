-- =============================================================================
-- DEBTOR-OF01-HISTORY-P04-A1-R2 (1/2 - enum + kolon)
-- Owner "P04 DEADLINE REGIME CONTRACT" duzeltmesi: serviceRegimeCode TEK BASINA
-- yeterli degildi - TK m.20 kendi icinde iki ayri hukuki sonuca ayriliyor. Bu
-- migration YALNIZ additive'dir: 2 yeni enum (ServiceCompletionMode,
-- SubstituteRecipientBasis) + ServiceOccurrenceRegimeCode'a 3 yeni deger
-- (IMMEDIATE_SERVICE/TK_20_TEMPORARY_ABSENCE/ELECTRONIC) + 2 yeni nullable kolon.
-- Data update/backfill/drop/rename YOK. Eski DIRECT_DELIVERY/TK_20 degerleri
-- KALDIRILMADI (Postgres enum degerleri RENAME/DROP edilemez, owner brief bunu
-- acikca yasakliyor) - hicbir canli satirda hic yazilmadilar (R1 migration'i
-- hukuk_db'ye hic uygulanmadi), artik yalniz olu, bir daha yazilmayacak uyeler.
--
-- NEDEN IKI AYRI MIGRATION DOSYASI: Postgres, `ALTER TYPE ... ADD VALUE` ile
-- eklenen yeni bir enum degerinin AYNI transaction icinde kullanilmasina
-- (ornegin bir CHECK constraint'in bu degeri referans etmesi) izin vermez
-- ("unsafe use of new value ... before it has been committed"). Prisma her
-- migration dosyasini kendi ayri transaction'i icinde calistirir - bu yuzden
-- ADD VALUE bu dosyada, onu REFERANS EDEN CHECK constraint'ler ise ayri, sonraki
-- migration dosyasinda (20260723120100_...) yer alir.
-- =============================================================================

-- CreateEnum
CREATE TYPE "ServiceCompletionMode" AS ENUM ('DIRECT_RECIPIENT_DELIVERY', 'DELIVERED_TO_AUTHORIZED_PERSON', 'NOTICE_POSTED', 'ELECTRONIC_DELIVERY', 'PUBLICATION');

-- CreateEnum
CREATE TYPE "SubstituteRecipientBasis" AS ENUM ('ARTICLE_13', 'ARTICLE_14', 'ARTICLE_16', 'ARTICLE_17', 'ARTICLE_18');

-- AlterEnum (yeni degerler - eski DIRECT_DELIVERY/TK_20 KORUNUR, bkz. yukaridaki aciklama)
ALTER TYPE "ServiceOccurrenceRegimeCode" ADD VALUE 'IMMEDIATE_SERVICE';
ALTER TYPE "ServiceOccurrenceRegimeCode" ADD VALUE 'TK_20_TEMPORARY_ABSENCE';
ALTER TYPE "ServiceOccurrenceRegimeCode" ADD VALUE 'ELECTRONIC';

-- AlterTable
ALTER TABLE "ServiceOccurrence" ADD COLUMN     "serviceCompletionMode" "ServiceCompletionMode";
ALTER TABLE "ServiceOccurrence" ADD COLUMN     "substituteRecipientBasis" "SubstituteRecipientBasis";
