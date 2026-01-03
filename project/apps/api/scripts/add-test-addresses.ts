import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Ege Tekstil borçlusunu bul
  const debtor = await prisma.debtor.findFirst({
    where: {
      name: { contains: 'Ege Tekstil' }
    },
    include: {
      debtorAddresses: true
    }
  });

  if (!debtor) {
    console.log('Ege Tekstil borçlusu bulunamadı');
    return;
  }

  console.log('Borçlu bulundu:', debtor.name);
  console.log('Mevcut adres sayısı:', debtor.debtorAddresses.length);

  // Mevcut adresleri listele
  for (const addr of debtor.debtorAddresses) {
    console.log(`  - ${addr.type}: ${addr.street}, ${addr.city}`);
  }

  // Mevcut adresi LEGAL_CENTER olarak güncelle (şirket merkezi)
  if (debtor.debtorAddresses.length > 0) {
    const firstAddr = debtor.debtorAddresses[0];
    await prisma.debtorAddress.update({
      where: { id: firstAddr.id },
      data: {
        type: 'LEGAL_CENTER',
        source: 'TICARET_SICILI',
        legalPriority: 'HIGH',
        canApply21_2: true,
      }
    });
    console.log('✓ Mevcut adres LEGAL_CENTER olarak güncellendi');
  }

  // Şube adresi ekle
  const branchExists = debtor.debtorAddresses.some(a => a.type === 'BUSINESS_BRANCH');
  if (!branchExists) {
    await prisma.debtorAddress.create({
      data: {
        debtorId: debtor.id,
        type: 'BUSINESS_BRANCH',
        source: 'USER_INPUT',
        street: 'Organize Sanayi Bölgesi 2. Cadde No:45',
        city: 'İzmir',
        district: 'Torbalı',
        postalCode: '35860',
        legalPriority: 'MEDIUM',
        canApply21_2: false,
        verified: false,
      }
    });
    console.log('✓ Şube adresi eklendi');
  }

  // KEP adresi ekle
  const kepExists = debtor.debtorAddresses.some(a => a.type === 'KEP');
  if (!kepExists) {
    await prisma.debtorAddress.create({
      data: {
        debtorId: debtor.id,
        type: 'KEP',
        source: 'USER_INPUT',
        street: 'egetekstil@hs01.kep.tr',
        city: 'İstanbul',
        district: '',
        legalPriority: 'MEDIUM',
        canApply21_2: false,
        verified: true,
      }
    });
    console.log('✓ KEP adresi eklendi');
  }

  // Bildirilen adres ekle
  const declaredExists = debtor.debtorAddresses.some(a => a.type === 'DECLARED');
  if (!declaredExists) {
    await prisma.debtorAddress.create({
      data: {
        debtorId: debtor.id,
        type: 'DECLARED',
        source: 'CONTRACT',
        street: 'Maslak Mah. Büyükdere Cad. No:255 Kat:12',
        city: 'İstanbul',
        district: 'Sarıyer',
        postalCode: '34398',
        legalPriority: 'LOW',
        canApply21_2: false,
        verified: false,
      }
    });
    console.log('✓ Bildirilen adres eklendi');
  } else {
    console.log('- Bildirilen adres zaten mevcut');
  }

  // Sonucu kontrol et
  const updatedDebtor = await prisma.debtor.findUnique({
    where: { id: debtor.id },
    include: { debtorAddresses: true }
  });

  console.log('\n=== Güncel Adres Listesi ===');
  for (const addr of updatedDebtor!.debtorAddresses) {
    console.log(`  [${addr.legalPriority}] ${addr.type}: ${addr.street}, ${addr.city}`);
  }
  console.log(`Toplam: ${updatedDebtor!.debtorAddresses.length} adres`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
