/**
 * İcra dairelerinin banka bilgilerini seed dosyasından güncelle
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seed dosyasındaki banka bilgileri (sadece İstanbul Bakırköy örneği)
const bankData: Record<string, { bankName: string; branchName?: string }> = {
  // Tüm Vakıfbank hesapları için
  'Vakıf': { bankName: 'T. Vakıflar Bankası T.A.O.', branchName: 'Adliye Şubesi' },
};

async function main() {
  console.log('=== İcra Dairesi Banka Bilgilerini Güncelleme ===\n');

  // Banka adı boş olan ve IBAN'ı olan icra dairelerini bul
  const offices = await prisma.executionOffice.findMany({
    where: {
      AND: [
        { iban: { not: null } },
        { iban: { not: '' } },
        { OR: [{ bankName: null }, { bankName: '' }] }
      ]
    },
  });

  console.log(`${offices.length} icra dairesinde banka adı eksik (IBAN var)\n`);

  let updated = 0;
  for (const office of offices) {
    // IBAN'dan banka belirle
    let bankName = '';
    let branchName = office.branchName || '';
    
    if (office.iban) {
      // TR ile başlayan IBAN'lar
      if (office.iban.startsWith('TR')) {
        // Vakıfbank: TR + 00015001...
        if (office.iban.substring(4, 8) === '0001' && office.iban.substring(8, 12) === '5001') {
          bankName = 'T. Vakıflar Bankası T.A.O.';
        }
        // Ziraat: TR + 00010...
        else if (office.iban.substring(4, 9) === '00010') {
          bankName = 'T.C. Ziraat Bankası A.Ş.';
        }
        // Halkbank: TR + 00012...
        else if (office.iban.substring(4, 9) === '00012') {
          bankName = 'Türkiye Halk Bankası A.Ş.';
        }
        // Diğer Vakıfbank formatları
        else if (office.iban.includes('0001500158')) {
          bankName = 'T. Vakıflar Bankası T.A.O.';
        }
      }
      // Sadece rakamlardan oluşan hesap numaraları (eski format)
      else if (/^\d+$/.test(office.iban)) {
        // Şube adından banka belirle
        if (branchName.toLowerCase().includes('vakıf')) {
          bankName = 'T. Vakıflar Bankası T.A.O.';
        } else if (branchName.toLowerCase().includes('ziraat')) {
          bankName = 'T.C. Ziraat Bankası A.Ş.';
        } else if (branchName.toLowerCase().includes('halk')) {
          bankName = 'Türkiye Halk Bankası A.Ş.';
        }
      }
    }

    // Şube adından banka belirle (fallback)
    if (!bankName && branchName) {
      if (branchName.toLowerCase().includes('vakıf')) {
        bankName = 'T. Vakıflar Bankası T.A.O.';
      } else if (branchName.toLowerCase().includes('ziraat')) {
        bankName = 'T.C. Ziraat Bankası A.Ş.';
      } else if (branchName.toLowerCase().includes('halk')) {
        bankName = 'Türkiye Halk Bankası A.Ş.';
      }
    }

    if (bankName) {
      await prisma.executionOffice.update({
        where: { id: office.id },
        data: { bankName },
      });
      console.log(`✓ ${office.name}: ${bankName}`);
      updated++;
    } else {
      console.log(`✗ ${office.name}: Banka belirlenemedi (IBAN: ${office.iban}, Şube: ${branchName})`);
    }
  }

  console.log(`\n📊 Sonuç: ${updated}/${offices.length} icra dairesi güncellendi`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
