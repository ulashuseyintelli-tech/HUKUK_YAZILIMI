import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function check() {
  const clients = await prisma.client.findMany({
    where: { tenantId: TENANT_ID },
    select: { 
      id: true, 
      displayName: true, 
      firstName: true, 
      lastName: true, 
      tckn: true, 
      createdAt: true,
      powerOfAttorneys: { select: { id: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
  
  console.log('Tüm müvekkiller:');
  clients.forEach(c => {
    const name = c.displayName || `${c.firstName} ${c.lastName}`;
    const poaCount = c.powerOfAttorneys.length;
    console.log(`${c.id} | ${name} | TCKN: ${c.tckn || 'YOK'} | Vekalet: ${poaCount} | ${c.createdAt}`);
  });
  
  console.log(`\nToplam: ${clients.length} müvekkil`);
  
  // TCKN bazında grupla
  const byTckn = new Map<string, typeof clients>();
  clients.forEach(c => {
    if (c.tckn) {
      const existing = byTckn.get(c.tckn) || [];
      existing.push(c);
      byTckn.set(c.tckn, existing);
    }
  });
  
  // Duplicate'ları göster
  console.log('\nDuplicate TCKN\'ler:');
  for (const [tckn, list] of byTckn.entries()) {
    if (list.length > 1) {
      console.log(`\nTCKN: ${tckn} (${list.length} kayıt)`);
      list.forEach(c => {
        const name = c.displayName || `${c.firstName} ${c.lastName}`;
        console.log(`  - ${c.id} | ${name} | Vekalet: ${c.powerOfAttorneys.length}`);
      });
    }
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
