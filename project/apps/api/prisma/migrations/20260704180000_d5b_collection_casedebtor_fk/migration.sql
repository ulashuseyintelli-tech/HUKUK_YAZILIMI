-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

