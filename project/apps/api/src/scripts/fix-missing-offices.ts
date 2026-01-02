/**
 * Eksik icra dairesi olan takipleri düzelt
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingOffices() {
  console.log('🔧 Eksik icra dairesi olan takipler düzeltiliyor...\n');

  // Bakırköy 1. İcra Dairesi'ni al (varsayılan olarak)
  const defaultOffice = await prisma.executionOffice.findFirst({
    where: { name: 'Bakırköy 1. İcra Dairesi' },
    select: { id: true, name: true, uyapCode: true }
  });

  if (!defaultOffice) {
    console.log('❌ Varsayılan icra dairesi bulunamadı!');
    await prisma.$disconnect();
    return;
  }

  console.log(`📍 Varsayılan icra dairesi: ${defaultOffice.name} (${defaultOffice.id})\n`);

  // Eksik icra dairesi olan takipleri bul
  const casesWithoutOffice = await prisma.case.findMany({
    where: { executionOfficeId: null },
    select: { id: true, fileNumber: true }
  });

  console.log(`📊 ${casesWithoutOffice.length} takip icra dairesi eksik.\n`);

  for (const c of casesWithoutOffice) {
    await prisma.case.update({
      where: { id: c.id },
      data: {
        executionOfficeId: defaultOffice.id,
        uyapBirimKodu: defaultOffice.uyapCode,
        hasUyapWarning: false,
      }
    });
    console.log(`✓ ${c.fileNumber} → ${defaultOffice.name}`);
  }

  console.log('\n✅ Tamamlandı!');
  await prisma.$disconnect();
}

fixMissingOffices();
