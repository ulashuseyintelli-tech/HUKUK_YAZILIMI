import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Fuat Atahan müvekkilini bul
  const clients = await prisma.client.findMany({
    where: {
      OR: [
        { displayName: { contains: 'fuat', mode: 'insensitive' } },
        { firstName: { contains: 'fuat', mode: 'insensitive' } },
        { lastName: { contains: 'atahan', mode: 'insensitive' } },
      ],
    },
  });

  if (clients.length === 0) {
    console.log('Fuat Atahan bulunamadı!');
    return;
  }

  for (const client of clients) {
    console.log(`Siliniyor: ${client.displayName} (ID: ${client.id})`);
    
    // Önce ilişkili vekaletleri sil
    const poas = await prisma.clientPowerOfAttorney.findMany({
      where: { clientId: client.id },
    });
    
    for (const poa of poas) {
      // Vekalet-avukat ilişkilerini sil
      await prisma.poaLawyer.deleteMany({ where: { poaId: poa.id } });
      // Vekaleti sil
      await prisma.clientPowerOfAttorney.delete({ where: { id: poa.id } });
      console.log(`  - Vekalet silindi: ${poa.id}`);
    }
    
    // Müvekkili sil
    await prisma.client.delete({ where: { id: client.id } });
    console.log(`  ✓ Müvekkil silindi`);
  }

  console.log('\n✅ Fuat Atahan silindi. Şimdi vekaleti tarayabilirsiniz.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
