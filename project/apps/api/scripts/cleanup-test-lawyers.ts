import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

// Silinmeyecek avukatlar (gerçek avukatlar)
const KEEP_LAWYERS = [
  'Fatma Uluca Telli',
  'Ulaş Hüseyin Telli',
  'Ege Durusoy',
];

async function cleanup() {
  console.log('Test avukatları siliniyor...\n');
  
  const lawyers = await prisma.lawyer.findMany({
    where: { tenantId: TENANT_ID },
    include: {
      poaLawyers: true,
      caseLawyers: true,
    }
  });
  
  let deleted = 0;
  let kept = 0;
  
  for (const lawyer of lawyers) {
    const fullName = `${lawyer.name} ${lawyer.surname}`;
    
    if (KEEP_LAWYERS.includes(fullName)) {
      console.log(`✅ Korunuyor: ${fullName}`);
      kept++;
      continue;
    }
    
    // İlişkili kayıt var mı kontrol et
    if (lawyer.poaLawyers.length > 0 || lawyer.caseLawyers.length > 0) {
      console.log(`⚠️ İlişkili kayıt var, atlanıyor: ${fullName}`);
      kept++;
      continue;
    }
    
    // Sil
    await prisma.lawyer.delete({ where: { id: lawyer.id } });
    console.log(`❌ Silindi: ${fullName}`);
    deleted++;
  }
  
  console.log(`\n=== Temizlik Tamamlandı ===`);
  console.log(`Silinen: ${deleted}`);
  console.log(`Kalan: ${kept}`);
  
  // Kalan avukatları listele
  const remaining = await prisma.lawyer.findMany({
    where: { tenantId: TENANT_ID },
    select: { name: true, surname: true, tckn: true }
  });
  
  console.log('\nKalan avukatlar:');
  remaining.forEach(l => {
    console.log(`  - ${l.name} ${l.surname} (TCKN: ${l.tckn || 'YOK'})`);
  });
}

cleanup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
