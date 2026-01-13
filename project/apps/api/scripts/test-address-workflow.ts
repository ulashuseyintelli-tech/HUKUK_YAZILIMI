import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // İlk case'i bul
  const caseData = await prisma.case.findFirst();

  if (!caseData) {
    console.log('Hiç dosya bulunamadı!');
    return;
  }

  console.log('=== DOSYA BİLGİLERİ ===');
  console.log('Case ID:', caseData.id);
  console.log('File Number:', caseData.fileNumber);
  console.log('Tenant ID:', caseData.tenantId);
  
  // Borçluları ayrı sorgula
  const debtors = await prisma.caseDebtor.findMany({
    where: { caseId: caseData.id },
    include: { debtor: true },
  });
  
  console.log('');
  console.log('=== BORÇLULAR ===');
  for (const cd of debtors) {
    console.log(`- ${cd.debtor.name} (${cd.debtor.type}) - ID: ${cd.debtorId}`);
  }
  
  // Müvekkili ayrı sorgula
  const clients = await prisma.caseClient.findMany({
    where: { caseId: caseData.id },
    include: { client: true },
  });
  
  console.log('');
  console.log('=== MÜVEKKİL ===');
  const client = clients[0]?.client;
  if (client) {
    console.log(`- ${client.displayName} - Email: ${client.email}`);
  } else {
    console.log('Müvekkil bulunamadı!');
  }
  
  console.log('');
  console.log('=== TEST KOMUTU ===');
  console.log(`curl -X POST http://localhost:8080/api/address-tasks/case/${caseData.id}/trigger-address-workflow -H "Content-Type: application/json" -d "{\\"tenantId\\": \\"${caseData.tenantId}\\"}"`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
