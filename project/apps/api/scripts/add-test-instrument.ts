/**
 * Test için CaseInstrument kaydı ekle
 * Kullanım: npx ts-node scripts/add-test-instrument.ts <caseId>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const caseId = args[0];
  
  if (!caseId) {
    console.log('Kullanım: npx ts-node scripts/add-test-instrument.ts <caseId>');
    console.log('');
    console.log('Mevcut CHECK dosyalarını listele:');
    const checkCases = await prisma.case.findMany({
      where: { type: 'CHECK' },
      select: { id: true, fileNumber: true, caseDate: true, principalAmount: true, tenantId: true },
      take: 10,
    });
    console.log(checkCases);
    return;
  }

  // Case'i bul (tenantId dahil)
  const caseItem = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, fileNumber: true, caseDate: true, principalAmount: true, type: true, tenantId: true }
  });

  if (!caseItem) {
    console.error('Case bulunamadı:', caseId);
    return;
  }

  console.log('Case bulundu:', caseItem);

  // Mevcut instrument var mı kontrol et
  const existingInstrument = await prisma.caseInstrument.findFirst({
    where: { caseId: caseId },
  });
  
  if (existingInstrument) {
    console.log('Bu case için zaten instrument var:', existingInstrument);
    return;
  }

  // Takip tarihinden 60 gün önce ibraz tarihi
  const caseDate = caseItem.caseDate ? new Date(caseItem.caseDate) : new Date();
  const presentmentDate = new Date(caseDate);
  presentmentDate.setDate(presentmentDate.getDate() - 60);
  
  // Vade tarihi = ibraz tarihinden 10 gün önce
  const maturityDate = new Date(presentmentDate);
  maturityDate.setDate(maturityDate.getDate() - 10);

  // Instrument oluştur (tenantId dahil)
  const instrument = await prisma.caseInstrument.create({
    data: {
      tenantId: caseItem.tenantId,
      caseId: caseId,
      instrumentType: 'CEK',
      serialNo: 'TEST-001',
      amount: caseItem.principalAmount || 100000,
      currency: 'TRY',
      issueDate: maturityDate,
      maturityDate: maturityDate,
      presentmentDate: presentmentDate,
      isBounced: true,
      bounceDate: presentmentDate,
      bankName: 'Test Bankası',
      bankBranch: 'Merkez Şube',
    }
  });

  console.log('Instrument oluşturuldu:', instrument);
  console.log('');
  console.log('Tarihler:');
  console.log('  - Vade Tarihi:', maturityDate.toISOString().split('T')[0]);
  console.log('  - İbraz Tarihi:', presentmentDate.toISOString().split('T')[0]);
  console.log('  - Takip Tarihi:', caseDate.toISOString().split('T')[0]);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
