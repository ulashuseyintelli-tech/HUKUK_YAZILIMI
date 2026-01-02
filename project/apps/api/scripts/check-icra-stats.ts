import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function check() {
  const total = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID } });
  const withIban = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID, iban: { not: null } } });
  const withTax = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID, taxNumber: { not: null } } });
  
  console.log('=== İcra Dairesi İstatistikleri ===');
  console.log(`Toplam: ${total}`);
  console.log(`IBAN bilgisi olan: ${withIban}`);
  console.log(`Vergi no bilgisi olan: ${withTax}`);
  
  // İstanbul örneği
  const istanbul = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID, city: 'İstanbul' },
    take: 5,
    select: { name: true, iban: true, taxNumber: true, branchName: true }
  });
  
  console.log('\nİstanbul örnekleri:');
  istanbul.forEach(i => {
    console.log(`  - ${i.name}`);
    console.log(`    IBAN: ${i.iban || 'YOK'}`);
    console.log(`    Vergi No: ${i.taxNumber || 'YOK'}`);
    console.log(`    Şube: ${i.branchName || 'YOK'}`);
  });
  
  // İl bazında dağılım
  const byCity = await prisma.executionOffice.groupBy({
    by: ['city'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 10
  });
  
  console.log('\nEn çok icra dairesi olan 10 il:');
  byCity.forEach((c: any) => console.log(`  ${c.city}: ${c._count}`));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
