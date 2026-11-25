-- F03-C (OFP-04 / WR01 B05): görev içi bağımsız ilk kontrol. YALNIZ EKLEME: Task tablosuna yeni kolonlar + değer denetimi.
-- TaskStatus enum'una değer EKLENMEZ (eski derleme okuması bozulmaz). Mevcut satırlar değişmez: reviewRequired = false,
-- diğer kolonlar NULL. Durum (status) içeren çapraz CHECK bilerek YOKTUR: geri dönüşte eski derleme yeni kolonları
-- bilmeden durum yazar ve böyle bir denetim eski derlemenin yazımını kırardı.
-- Geri dönüş sınırı: kod geri alınır, kolonlar kalır; eski derleme "kontrolde" görevi "devam ediyor" görür.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewStatus" TEXT,
ADD COLUMN     "reviewSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "reviewSubmittedByUserId" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "reviewNote" TEXT;

-- CreateIndex
CREATE INDEX "Task_tenantId_reviewStatus_idx" ON "Task"("tenantId", "reviewStatus");

-- Domain invariants (yalnız yeni kolonlar).
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewStatus_check" CHECK ("reviewStatus" IS NULL OR "reviewStatus" IN ('AWAITING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'));
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewNote_check" CHECK ("reviewNote" IS NULL OR char_length("reviewNote") <= 2000);
