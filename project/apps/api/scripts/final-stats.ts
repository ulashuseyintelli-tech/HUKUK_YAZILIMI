import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function showStats() {
  console.log('='.repeat(60));
  console.log('         UYAP VERİ IMPORT SONUÇLARI');
  console.log('='.repeat(60));
  
  // İcra Daireleri
  const icraTotal = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID } });
  const icraWithUyap = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID, uyapCode: { not: null } } });
  const icraWithIban = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID, iban: { not: null } } });
  const icraWithTax = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID, taxNumber: { not: null } } });
  
  console.log('\n📁 İCRA DAİRELERİ');
  console.log(`   Toplam: ${icraTotal}`);
  console.log(`   UYAP kodu olan: ${icraWithUyap}`);
  console.log(`   IBAN bilgisi olan: ${icraWithIban}`);
  console.log(`   Vergi no bilgisi olan: ${icraWithTax}`);
  
  // Mahkemeler
  const courtTotal = await prisma.court.count({ where: { tenantId: TENANT_ID } });
  const courtWithUyap = await prisma.court.count({ where: { tenantId: TENANT_ID, uyapCode: { not: null } } });
  
  console.log('\n⚖️  MAHKEMELER');
  console.log(`   Toplam: ${courtTotal}`);
  console.log(`   UYAP kodu olan: ${courtWithUyap}`);
  
  // İl bazında icra daireleri
  const icraByCity = await prisma.executionOffice.groupBy({
    by: ['city'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 5,
  });
  
  console.log('\n📍 EN ÇOK İCRA DAİRESİ OLAN İLLER');
  icraByCity.forEach((c: any) => console.log(`   ${c.city}: ${c._count}`));
  
  // İl bazında mahkemeler
  const courtByCity = await prisma.court.groupBy({
    by: ['city'],
    where: { tenantId: TENANT_ID },
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 5,
  });
  
  console.log('\n📍 EN ÇOK MAHKEME OLAN İLLER');
  courtByCity.forEach((c: any) => console.log(`   ${c.city}: ${c._count}`));
  
  console.log('\n' + '='.repeat(60));
}

showStats()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
