/**
 * Takiplerdeki borçulara varsayılan adres ata
 * - Eğer selectedAddressId yoksa, borçunun ilk adresini seç
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCaseDebtorAddresses() {
  console.log('🔧 Takiplerdeki borçulara varsayılan adres atanıyor...\n');

  // Seçili adresi olmayan CaseDebtor kayıtlarını al
  const caseDebtorsWithoutAddress = await prisma.caseDebtor.findMany({
    where: {
      selectedAddressId: null,
    },
    include: {
      case: { select: { fileNumber: true } },
      debtor: {
        include: {
          debtorAddresses: {
            orderBy: { isPrimary: 'desc' }
          },
        }
      },
    },
  });

  console.log(`📊 ${caseDebtorsWithoutAddress.length} takip-borçlu kaydında seçili adres yok.\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const cd of caseDebtorsWithoutAddress) {
    // Borçunun adresi var mı?
    if (cd.debtor.debtorAddresses.length > 0) {
      // İlk adresi (veya primary olanı) seç
      const firstAddress = cd.debtor.debtorAddresses[0];
      
      await prisma.caseDebtor.update({
        where: { id: cd.id },
        data: {
          selectedAddressId: firstAddress.id,
        }
      });
      
      console.log(`✓ ${cd.case.fileNumber} - ${cd.debtor.name} → ${firstAddress.street.substring(0, 30)}...`);
      updatedCount++;
    } else {
      console.log(`⚠️ ${cd.case.fileNumber} - ${cd.debtor.name} → Borçunun hiç adresi yok!`);
      skippedCount++;
    }
  }

  console.log(`\n✅ Tamamlandı!`);
  console.log(`   - Güncellenen: ${updatedCount}`);
  console.log(`   - Atlanan (adres yok): ${skippedCount}`);

  await prisma.$disconnect();
}

fixCaseDebtorAddresses();
