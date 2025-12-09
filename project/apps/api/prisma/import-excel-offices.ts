import * as XLSX from 'xlsx';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// İcra dairesi adından il çıkar
function extractCity(officeName: string): string {
  const name = officeName.toUpperCase().trim();
  
  // Özel durumlar
  const specialCases: Record<string, string> = {
    'ADALAR': 'İSTANBUL',
    'KADIKÖY': 'İSTANBUL',
    'BAKIRKÖY': 'İSTANBUL',
    'KÜÇÜKÇEKMECE': 'İSTANBUL',
    'BÜYÜKÇEKMECE': 'İSTANBUL',
    'KARTAL': 'İSTANBUL',
    'ÜSKÜDAR': 'İSTANBUL',
    'BEYKOZ': 'İSTANBUL',
    'ŞİŞLİ': 'İSTANBUL',
    'BEŞİKTAŞ': 'İSTANBUL',
    'SARIYER': 'İSTANBUL',
    'EYÜP': 'İSTANBUL',
    'FATİH': 'İSTANBUL',
    'BEYOĞLU': 'İSTANBUL',
    'GAZİOSMANPAŞA': 'İSTANBUL',
    'ESENLER': 'İSTANBUL',
    'BAĞCILAR': 'İSTANBUL',
    'GÜNGÖREN': 'İSTANBUL',
    'BAYRAMPAŞA': 'İSTANBUL',
    'ZEYTİNBURNU': 'İSTANBUL',
    'AVCILAR': 'İSTANBUL',
    'ESENYURT': 'İSTANBUL',
    'ARNAVUTKÖY': 'İSTANBUL',
    'BAŞAKŞEHIR': 'İSTANBUL',
    'SULTANBEYLİ': 'İSTANBUL',
    'TUZLA': 'İSTANBUL',
    'PENDİK': 'İSTANBUL',
    'MALTEPE': 'İSTANBUL',
    'ATAŞEHİR': 'İSTANBUL',
    'ÜMRANİYE': 'İSTANBUL',
    'ÇEKMEKÖY': 'İSTANBUL',
    'SANCAKTEPE': 'İSTANBUL',
    'SİLİVRİ': 'İSTANBUL',
    'ÇATALCA': 'İSTANBUL',
    'GEBZE': 'KOCAELİ',
    'KARŞIYAKA': 'İZMİR',
    'KONAK': 'İZMİR',
    'BORNOVA': 'İZMİR',
    'BUCA': 'İZMİR',
    'ALANYA': 'ANTALYA',
    'MANAVGAT': 'ANTALYA',
    'SİNCAN': 'ANKARA',
    'ÇANKAYA': 'ANKARA',
    'KEÇİÖREN': 'ANKARA',
    'MAMAK': 'ANKARA',
    'ETİMESGUT': 'ANKARA',
    'YENİMAHALLE': 'ANKARA',
    'ALTINDAĞ': 'ANKARA',
    'PURSAKLAR': 'ANKARA',
    'TARSUS': 'MERSİN',
    'İSKENDERUN': 'HATAY',
  };

  // İlk kelimeyi al
  const firstWord = name.split(' ')[0];
  
  // Özel durum kontrolü
  if (specialCases[firstWord]) {
    return specialCases[firstWord];
  }
  
  // Sayı ile başlıyorsa (örn: "1. İCRA") - İstanbul merkez
  if (/^\d/.test(firstWord)) {
    return 'İSTANBUL';
  }
  
  // İl adı olarak döndür
  return firstWord;
}

// Banka adını temizle
function cleanBankName(bankName: string): string {
  if (!bankName) return '';
  return bankName
    .replace(/şb\./gi, 'Şubesi')
    .replace(/şb$/gi, 'Şubesi')
    .trim();
}

async function importExcel(tenantId: string) {
  const filePath = path.join(__dirname, 'icra-daireleri.xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  console.log('📊 Excel okundu, toplam satır:', data.length);

  // Başlık satırını bul (satır 8)
  const headerRowIndex = 8;
  const headers = data[headerRowIndex];
  console.log('📋 Başlıklar:', headers);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Veri satırlarını işle (satır 9'dan itibaren)
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const officeName = row[0]?.toString()?.trim();
    if (!officeName) continue;

    const taxNumber = row[1]?.toString()?.trim() || null;
    const iban = row[2]?.toString()?.trim() || null;
    const branchCode = row[3]?.toString()?.trim() || null;
    const branchName = row[4]?.toString()?.trim() || null;

    const city = extractCity(officeName);
    const bankName = branchName ? cleanBankName(branchName).split(' ')[0] : null;

    try {
      // Aynı isimde kayıt var mı kontrol et
      const existing = await prisma.executionOffice.findFirst({
        where: { tenantId, name: officeName },
      });

      if (existing) {
        // Güncelle
        await prisma.executionOffice.update({
          where: { id: existing.id },
          data: {
            city,
            taxNumber,
            iban,
            bankName,
            branchName: cleanBankName(branchName || ''),
            isActive: true,
          },
        });
        updated++;
      } else {
        // Yeni oluştur
        await prisma.executionOffice.create({
          data: {
            tenantId,
            name: officeName,
            city,
            taxNumber,
            iban,
            bankName,
            branchName: cleanBankName(branchName || ''),
            isActive: true,
          },
        });
        created++;
      }
    } catch (err: any) {
      console.error(`❌ Hata (satır ${i}): ${officeName}`, err.message);
      errors++;
    }
  }

  console.log('\n✅ Import tamamlandı!');
  console.log(`   📥 Yeni eklenen: ${created}`);
  console.log(`   🔄 Güncellenen: ${updated}`);
  console.log(`   ⏭️ Atlanan: ${skipped}`);
  console.log(`   ❌ Hata: ${errors}`);
}

async function main() {
  // İlk tenant'ı bul
  const tenant = await prisma.tenant.findFirst();
  
  if (!tenant) {
    console.error('❌ Tenant bulunamadı!');
    process.exit(1);
  }
  
  console.log(`🏢 Tenant: ${tenant.name} (${tenant.id})`);
  await importExcel(tenant.id);
}

main()
  .catch((e) => {
    console.error('❌ Import hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
