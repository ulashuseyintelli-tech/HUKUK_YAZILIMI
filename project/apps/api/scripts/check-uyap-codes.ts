import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function check() {
  // UYAP kodu olan icra dairelerini say
  const withUyap = await prisma.executionOffice.count({ 
    where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
  });
  const total = await prisma.executionOffice.count({ 
    where: { tenantId: TENANT_ID } 
  });
  
  console.log(`UYAP kodu olan: ${withUyap} / ${total}`);
  
  // Örnek göster
  const samples = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID },
    take: 10,
    select: { name: true, uyapCode: true, officeCode: true, city: true }
  });
  
  console.log('\nÖrnekler:');
  samples.forEach(s => {
    console.log(`  - ${s.name}`);
    console.log(`    UYAP Kodu: ${s.uyapCode}`);
    console.log(`    Ofis Kodu: ${s.officeCode}`);
    console.log(`    İl: ${s.city}`);
  });
  
  // Mahkeme sayısı
  const courtCount = await prisma.court.count({ where: { tenantId: TENANT_ID } });
  console.log(`\nMahkeme sayısı: ${courtCount}`);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
