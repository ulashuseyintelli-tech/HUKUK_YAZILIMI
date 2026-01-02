import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function check() {
  const lawyers = await prisma.lawyer.findMany({
    where: { tenantId: TENANT_ID },
    select: { 
      id: true, 
      name: true, 
      surname: true, 
      tckn: true, 
      barNumber: true,
      barCity: true,
      isActive: true 
    },
    orderBy: { name: 'asc' }
  });
  
  console.log('=== AVUKAT LİSTESİ ===\n');
  
  let withTckn = 0;
  let withoutTckn = 0;
  
  lawyers.forEach((l, i) => {
    const tcknStatus = l.tckn ? '✅' : '❌';
    if (l.tckn) withTckn++;
    else withoutTckn++;
    
    console.log(`${i + 1}. ${l.name} ${l.surname}`);
    console.log(`   TCKN: ${l.tckn || 'YOK'} ${tcknStatus}`);
    console.log(`   Baro: ${l.barCity || '-'} / ${l.barNumber || '-'}`);
    console.log(`   Aktif: ${l.isActive ? 'Evet' : 'Hayır'}`);
    console.log('');
  });
  
  console.log('=== ÖZET ===');
  console.log(`Toplam: ${lawyers.length}`);
  console.log(`TCKN'li: ${withTckn}`);
  console.log(`TCKN eksik: ${withoutTckn}`);
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
