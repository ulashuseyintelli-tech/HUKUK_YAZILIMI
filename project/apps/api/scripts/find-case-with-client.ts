import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Müvekkili olan dosyaları bul
  const caseClients = await prisma.caseClient.findMany({
    include: {
      client: true,
      case: true,
    },
    take: 5,
  });

  if (caseClients.length === 0) {
    console.log('Müvekkili olan dosya bulunamadı!');
    
    // Tüm müvekkilleri listele
    const clients = await prisma.client.findMany({ take: 5 });
    console.log('\nMevcut müvekkiller:');
    for (const c of clients) {
      console.log(`- ${c.displayName} (${c.email}) - ID: ${c.id}`);
    }
    return;
  }

  console.log('=== MÜVEKKİLİ OLAN DOSYALAR ===\n');
  
  for (const cc of caseClients) {
    console.log(`Dosya: ${cc.case.fileNumber} (ID: ${cc.caseId})`);
    console.log(`Müvekkil: ${cc.client.displayName} - ${cc.client.email}`);
    console.log(`Tenant: ${cc.case.tenantId}`);
    
    // Borçluları da getir
    const debtors = await prisma.caseDebtor.findMany({
      where: { caseId: cc.caseId },
      include: { debtor: true },
    });
    console.log(`Borçlular: ${debtors.map(d => d.debtor.name).join(', ')}`);
    console.log('---');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
