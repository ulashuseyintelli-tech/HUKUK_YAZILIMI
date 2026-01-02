/**
 * Mevcut takiplerdeki avukat rollerini büro ayarlarına göre düzelt
 * 
 * Bu script:
 * 1. Tüm CaseLawyer kayıtlarını tarar
 * 2. Her avukatın büro ayarlarındaki LawyerRank'ini alır
 * 3. LawyerRank'e göre CaseLawyerRole'ü günceller
 * 
 * Mapping:
 * - PARTNER/MANAGER → RESPONSIBLE (Sorumlu)
 * - AUTHORIZED → ASSIGNED (Yetkili)
 * - LAWYER → ASSISTANT (Yardımcı)
 * - INTERN → INTERN (Stajyer)
 * 
 * Kullanım:
 * npx ts-node src/scripts/fix-case-lawyer-roles.ts
 * npx ts-node src/scripts/fix-case-lawyer-roles.ts --fix
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// LawyerRank -> CaseLawyerRole mapping
function mapLawyerRankToRole(lawyerRank: string | null): 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN' {
  switch (lawyerRank) {
    case 'PARTNER':
    case 'MANAGER':
      return 'RESPONSIBLE';
    case 'AUTHORIZED':
      return 'ASSIGNED';
    case 'LAWYER':
      return 'ASSISTANT';
    case 'INTERN':
      return 'INTERN';
    default:
      return 'ASSIGNED'; // Varsayılan
  }
}

async function fixCaseLawyerRoles() {
  console.log('🔧 Mevcut takiplerdeki avukat rolleri düzeltiliyor...\n');

  // Tüm CaseLawyer kayıtlarını avukat bilgileriyle birlikte al
  const caseLawyers = await prisma.caseLawyer.findMany({
    include: {
      lawyer: {
        select: {
          id: true,
          name: true,
          surname: true,
          lawyerRank: true,
        },
      },
      case: {
        select: {
          id: true,
          fileNumber: true,
        },
      },
    },
  });

  console.log(`📊 Toplam ${caseLawyers.length} CaseLawyer kaydı bulundu.\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  const updates: { caseLawyerId: string; oldRole: string; newRole: string; lawyerName: string; fileNumber: string }[] = [];

  for (const cl of caseLawyers) {
    const lawyerRank = cl.lawyer.lawyerRank;
    const expectedRole = mapLawyerRankToRole(lawyerRank);
    const currentRole = cl.role;

    // Eğer rol zaten doğruysa atla
    if (currentRole === expectedRole) {
      skippedCount++;
      continue;
    }

    // Güncelle
    await prisma.caseLawyer.update({
      where: { id: cl.id },
      data: {
        role: expectedRole,
        isResponsible: expectedRole === 'RESPONSIBLE',
      },
    });

    updates.push({
      caseLawyerId: cl.id,
      oldRole: currentRole,
      newRole: expectedRole,
      lawyerName: `${cl.lawyer.name} ${cl.lawyer.surname}`,
      fileNumber: cl.case.fileNumber,
    });

    updatedCount++;
  }

  // Sonuçları yazdır
  console.log('📋 Güncellenen kayıtlar:\n');
  console.log('─'.repeat(80));
  console.log(`${'Dosya No'.padEnd(20)} | ${'Avukat'.padEnd(25)} | ${'Eski Rol'.padEnd(12)} | ${'Yeni Rol'.padEnd(12)}`);
  console.log('─'.repeat(80));

  for (const u of updates) {
    console.log(`${u.fileNumber.padEnd(20)} | ${u.lawyerName.padEnd(25)} | ${u.oldRole.padEnd(12)} | ${u.newRole.padEnd(12)}`);
  }

  console.log('─'.repeat(80));
  console.log(`\n✅ Tamamlandı!`);
  console.log(`   - Güncellenen: ${updatedCount}`);
  console.log(`   - Zaten doğru: ${skippedCount}`);
  console.log(`   - Toplam: ${caseLawyers.length}`);
}

// Dry-run modu (sadece göster, güncelleme yapma)
async function dryRun() {
  console.log('🔍 DRY RUN - Sadece kontrol, güncelleme yapılmayacak...\n');

  const caseLawyers = await prisma.caseLawyer.findMany({
    include: {
      lawyer: {
        select: {
          id: true,
          name: true,
          surname: true,
          lawyerRank: true,
        },
      },
      case: {
        select: {
          id: true,
          fileNumber: true,
        },
      },
    },
  });

  console.log(`📊 Toplam ${caseLawyers.length} CaseLawyer kaydı bulundu.\n`);

  let needsUpdateCount = 0;
  let correctCount = 0;

  console.log('─'.repeat(100));
  console.log(`${'Dosya No'.padEnd(20)} | ${'Avukat'.padEnd(25)} | ${'Büro Rank'.padEnd(12)} | ${'Mevcut Rol'.padEnd(12)} | ${'Olması Gereken'.padEnd(12)} | Durum`);
  console.log('─'.repeat(100));

  for (const cl of caseLawyers) {
    const lawyerRank = cl.lawyer.lawyerRank || 'N/A';
    const expectedRole = mapLawyerRankToRole(cl.lawyer.lawyerRank);
    const currentRole = cl.role;
    const isCorrect = currentRole === expectedRole;

    if (isCorrect) {
      correctCount++;
    } else {
      needsUpdateCount++;
    }

    const status = isCorrect ? '✓' : '⚠️ YANLIŞ';
    console.log(`${cl.case.fileNumber.padEnd(20)} | ${`${cl.lawyer.name} ${cl.lawyer.surname}`.padEnd(25)} | ${lawyerRank.padEnd(12)} | ${currentRole.padEnd(12)} | ${expectedRole.padEnd(12)} | ${status}`);
  }

  console.log('─'.repeat(100));
  console.log(`\n📊 Özet:`);
  console.log(`   - Doğru: ${correctCount}`);
  console.log(`   - Güncellenmesi gereken: ${needsUpdateCount}`);
  console.log(`   - Toplam: ${caseLawyers.length}`);

  if (needsUpdateCount > 0) {
    console.log(`\n💡 Güncellemek için: npx ts-node src/scripts/fix-case-lawyer-roles.ts --fix`);
  }
}

// Ana fonksiyon
async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');

  try {
    if (shouldFix) {
      await fixCaseLawyerRoles();
    } else {
      await dryRun();
    }
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
