import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Fuat Atahan müvekkilini bul
  console.log('\n=== FUAT ATAHAN MÜVEKKİL BİLGİLERİ ===');
  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { displayName: { contains: 'fuat', mode: 'insensitive' } },
        { firstName: { contains: 'fuat', mode: 'insensitive' } },
        { lastName: { contains: 'atahan', mode: 'insensitive' } },
      ],
    },
  });
  
  console.log('Bulunan müvekkiller:', clients.length);
  for (const c of clients) {
    console.log(`- ID: ${c.id}`);
    console.log(`  Ad: ${c.displayName}`);
    console.log(`  TCKN: ${c.tckn || 'YOK'}`);
    console.log(`  VKN: ${c.vkn || 'YOK'}`);
    console.log(`  Tip: ${c.type}`);
  }

  if (clients.length === 0) {
    console.log('Fuat Atahan bulunamadı!');
    return;
  }

  const clientId = clients[0].id;

  // 2. Bu müvekkilin vekaletlerini bul
  console.log('\n=== VEKALETLER ===');
  const poas = await prisma.clientPowerOfAttorney.findMany({
    where: { clientId },
    include: {
      lawyers: {
        include: {
          lawyer: {
            select: { id: true, name: true, surname: true, barNumber: true },
          },
        },
      },
    },
  });

  console.log('Bulunan vekaletler:', poas.length);
  for (const poa of poas) {
    console.log(`\n- Vekalet ID: ${poa.id}`);
    console.log(`  Status: ${poa.status}`);
    console.log(`  isActive: ${poa.isActive}`);
    console.log(`  isLimited: ${poa.isLimited}`);
    console.log(`  validUntil: ${poa.validUntil || 'Süresiz'}`);
    console.log(`  Noter: ${poa.notaryName || '-'}`);
    console.log(`  Yevmiye No: ${poa.journalNo || poa.poaNumber || '-'}`);
    console.log(`  Avukatlar (${poa.lawyers.length}):`);
    for (const pl of poa.lawyers) {
      console.log(`    * ${pl.lawyer.name} ${pl.lawyer.surname} (Baro: ${pl.lawyer.barNumber || '-'})`);
    }
  }

  // 3. Tüm avukatları listele
  console.log('\n=== TÜM AVUKATLAR ===');
  const lawyers = await prisma.lawyer.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, surname: true, barNumber: true, isActive: true },
  });
  
  for (const l of lawyers) {
    console.log(`- ${l.name} ${l.surname} (ID: ${l.id}, Aktif: ${l.isActive})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
