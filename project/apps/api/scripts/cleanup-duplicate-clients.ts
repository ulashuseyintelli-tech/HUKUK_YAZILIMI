import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function cleanup() {
  console.log('Duplicate müvekkilleri temizleme başlıyor...\n');
  
  // Tüm müvekkilleri al
  const clients = await prisma.client.findMany({
    where: { tenantId: TENANT_ID },
    include: { 
      powerOfAttorneys: true,
      caseClients: true,
      cases: true
    },
    orderBy: { createdAt: 'asc' }
  });
  
  // TCKN bazında grupla
  const byTckn = new Map<string, typeof clients>();
  clients.forEach(c => {
    if (c.tckn) {
      const existing = byTckn.get(c.tckn) || [];
      existing.push(c);
      byTckn.set(c.tckn, existing);
    }
  });
  
  let deletedCount = 0;
  
  for (const [tckn, list] of byTckn.entries()) {
    if (list.length > 1) {
      console.log(`\nTCKN: ${tckn} - ${list.length} duplicate kayıt bulundu`);
      
      // En çok ilişkisi olan veya en son oluşturulanı tut
      const sorted = list.sort((a, b) => {
        // Önce vekalet sayısına göre
        const poaDiff = b.powerOfAttorneys.length - a.powerOfAttorneys.length;
        if (poaDiff !== 0) return poaDiff;
        
        // Sonra case sayısına göre
        const caseDiff = (b.caseClients.length + b.cases.length) - (a.caseClients.length + a.cases.length);
        if (caseDiff !== 0) return caseDiff;
        
        // En son oluşturulanı tut
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      const keep = sorted[0];
      const toDelete = sorted.slice(1);
      
      console.log(`  ✓ Tutulacak: ${keep.id} | ${keep.displayName || keep.firstName + ' ' + keep.lastName} | Vekalet: ${keep.powerOfAttorneys.length}`);
      
      for (const client of toDelete) {
        console.log(`  ✗ Silinecek: ${client.id} | ${client.displayName || client.firstName + ' ' + client.lastName}`);
        
        // İlişkili kayıtları kontrol et
        if (client.powerOfAttorneys.length > 0 || client.caseClients.length > 0 || client.cases.length > 0) {
          console.log(`    ⚠️ İlişkili kayıtlar var, atlanıyor!`);
          continue;
        }
        
        await prisma.client.delete({ where: { id: client.id } });
        deletedCount++;
      }
    }
  }
  
  console.log(`\n=== Temizlik Tamamlandı ===`);
  console.log(`Silinen: ${deletedCount} müvekkil`);
  
  // Kalan müvekkilleri göster
  const remaining = await prisma.client.count({ where: { tenantId: TENANT_ID } });
  console.log(`Kalan: ${remaining} müvekkil`);
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
