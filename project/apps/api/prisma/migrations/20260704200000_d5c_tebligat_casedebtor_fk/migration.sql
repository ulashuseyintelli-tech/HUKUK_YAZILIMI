-- AddForeignKey
ALTER TABLE "Tebligat" ADD CONSTRAINT "Tebligat_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

