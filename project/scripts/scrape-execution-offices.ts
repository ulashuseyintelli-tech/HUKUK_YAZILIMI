/**
 * İcra Dairesi Banka Bilgileri Scraper
 * 
 * Adalet Bakanlığı İİDB sitesinden tüm icra dairelerinin banka bilgilerini çeker.
 * https://iidb.adalet.gov.tr/Home/SSSorularDetay/18
 * 
 * Kullanım:
 * npx ts-node scripts/scrape-execution-offices.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Türkiye'nin 81 ili ve plaka kodları
const CITIES: Record<string, string> = {
  "1": "ADANA",
  "2": "ADIYAMAN",
  "3": "AFYONKARAHİSAR",
  "4": "AĞRI",
  "5": "AMASYA",
  "6": "ANKARA",
  "7": "ANTALYA",
  "8": "ARTVİN",
  "9": "AYDIN",
  "10": "BALIKESİR",
  "11": "BİLECİK",
  "12": "BİNGÖL",
  "13": "BİTLİS",
  "14": "BOLU",
  "15": "BURDUR",
  "16": "BURSA",
  "17": "ÇANAKKALE",
  "18": "ÇANKIRI",
  "19": "ÇORUM",
  "20": "DENİZLİ",
  "21": "DİYARBAKIR",
  "22": "EDİRNE",
  "23": "ELAZIĞ",
  "24": "ERZİNCAN",
  "25": "ERZURUM",
  "26": "ESKİŞEHİR",
  "27": "GAZİANTEP",
  "28": "GİRESUN",
  "29": "GÜMÜŞHANE",
  "30": "HAKKARİ",
  "31": "HATAY",
  "32": "ISPARTA",
  "33": "MERSİN",
  "34": "İSTANBUL",
  "35": "İZMİR",
  "36": "KARS",
  "37": "KASTAMONU",
  "38": "KAYSERİ",
  "39": "KIRKLARELİ",
  "40": "KIRŞEHİR",
  "41": "KOCAELİ",
  "42": "KONYA",
  "43": "KÜTAHYA",
  "44": "MALATYA",
  "45": "MANİSA",
  "46": "KAHRAMANMARAŞ",
  "47": "MARDİN",
  "48": "MUĞLA",
  "49": "MUŞ",
  "50": "NEVŞEHİR",
  "51": "NİĞDE",
  "52": "ORDU",
  "53": "RİZE",
  "54": "SAKARYA",
  "55": "SAMSUN",
  "56": "SİİRT",
  "57": "SİNOP",
  "58": "SİVAS",
  "59": "TEKİRDAĞ",
  "60": "TOKAT",
  "61": "TRABZON",
  "62": "TUNCELİ",
  "63": "ŞANLIURFA",
  "64": "UŞAK",
  "65": "VAN",
  "66": "YOZGAT",
  "67": "ZONGULDAK",
  "68": "AKSARAY",
  "69": "BAYBURT",
  "70": "KARAMAN",
  "71": "KIRIKKALE",
  "72": "BATMAN",
  "73": "ŞIRNAK",
  "74": "BARTIN",
  "75": "ARDAHAN",
  "76": "IĞDIR",
  "77": "YALOVA",
  "78": "KARABÜK",
  "79": "KİLİS",
  "80": "OSMANİYE",
  "81": "DÜZCE"
};

interface RawOfficeData {
  birimAdi: string;
  vergiNo: string;
  vergiDairesi: string;
  hesapTuru: string; // Emanet, Harç, Cezaevi
  bankaAdi: string;
  iban: string;
}

interface ProcessedOffice {
  city: string;
  district?: string;
  name: string;
  uyapCode: string;
  taxNumber: string;
  bankName: string;
  iban: string;      // Emanet
  ibanHarc: string;
  ibanCezaevi: string;
}

// HTML'den tablo verilerini parse et
function parseTableData(html: string): RawOfficeData[] {
  const results: RawOfficeData[] = [];
  
  // Basit regex ile tablo satırlarını çek
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;
  
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const [, birimAdi, vergiNo, vergiDairesi, hesapTuru, bankaAdi, iban] = match;
    
    // Header satırını atla
    if (birimAdi.includes('BİRİM ADI')) continue;
    
    results.push({
      birimAdi: birimAdi.trim(),
      vergiNo: vergiNo.trim(),
      vergiDairesi: vergiDairesi.trim(),
      hesapTuru: hesapTuru.trim(),
      bankaAdi: bankaAdi.trim(),
      iban: iban.trim()
    });
  }
  
  return results;
}

// İlçe adını birim adından çıkar
function extractDistrict(birimAdi: string, cityName: string): string | undefined {
  // "İstanbul 1. İcra Dairesi" -> undefined (merkez)
  // "Bakırköy 1. İcra Dairesi" -> "Bakırköy"
  // "Silivri İcra Dairesi" -> "Silivri"
  
  const normalizedName = birimAdi.replace(' İcra Dairesi', '').replace(' İflas Dairesi', '');
  
  // Numara içeriyorsa ve il adıyla başlıyorsa merkez
  if (normalizedName.match(new RegExp(`^${cityName}\\s+\\d+\\.?$`, 'i'))) {
    return undefined;
  }
  
  // Özel isimler (Abonelik, Gayrimenkul, Banka Alacakları) merkez sayılır
  if (normalizedName.includes('Abonelik') || 
      normalizedName.includes('Gayrimenkul') || 
      normalizedName.includes('Banka Alacakları') ||
      normalizedName.includes('Genel')) {
    return undefined;
  }
  
  // İlçe adını çıkar
  const districtMatch = normalizedName.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?:\s+\d+\.?)?$/);
  if (districtMatch) {
    const district = districtMatch[1].trim();
    // İl adıyla aynıysa merkez
    if (district.toUpperCase() === cityName.toUpperCase()) {
      return undefined;
    }
    return district;
  }
  
  return undefined;
}

// Raw verileri işle ve grupla
function processOffices(rawData: RawOfficeData[], cityName: string): ProcessedOffice[] {
  // Birim adına göre grupla
  const grouped = new Map<string, { emanet?: RawOfficeData; harc?: RawOfficeData; cezaevi?: RawOfficeData }>();
  
  for (const row of rawData) {
    const key = row.birimAdi;
    if (!grouped.has(key)) {
      grouped.set(key, {});
    }
    
    const group = grouped.get(key)!;
    const hesapTuru = row.hesapTuru.toLowerCase();
    
    if (hesapTuru.includes('emanet')) {
      group.emanet = row;
    } else if (hesapTuru.includes('harç') || hesapTuru.includes('harc')) {
      group.harc = row;
    } else if (hesapTuru.includes('cezaevi')) {
      group.cezaevi = row;
    }
  }
  
  // ProcessedOffice'lere dönüştür
  const results: ProcessedOffice[] = [];
  
  for (const [birimAdi, accounts] of grouped) {
    const emanet = accounts.emanet;
    const harc = accounts.harc;
    const cezaevi = accounts.cezaevi;
    
    // En az emanet hesabı olmalı
    const baseData = emanet || harc || cezaevi;
    if (!baseData) continue;
    
    results.push({
      city: cityName,
      district: extractDistrict(birimAdi, cityName),
      name: birimAdi,
      uyapCode: baseData.vergiNo || '',
      taxNumber: baseData.vergiNo || '',
      bankName: baseData.bankaAdi || 'T. Vakıflar Bankası T.A.O.',
      iban: emanet?.iban || '',
      ibanHarc: harc?.iban || '',
      ibanCezaevi: cezaevi?.iban || ''
    });
  }
  
  // İsme göre sırala
  results.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  
  return results;
}

// TypeScript seed formatına dönüştür
function toSeedFormat(offices: ProcessedOffice[]): string {
  const lines: string[] = [];
  
  for (const office of offices) {
    const parts: string[] = [
      `city: "${office.city}"`,
    ];
    
    if (office.district) {
      parts.push(`district: "${office.district}"`);
    }
    
    parts.push(`name: "${office.name}"`);
    parts.push(`uyapCode: "${office.uyapCode}"`);
    
    if (office.taxNumber) {
      parts.push(`taxNumber: "${office.taxNumber}"`);
    }
    
    parts.push(`bankName: "${office.bankName}"`);
    parts.push(`iban: "${office.iban}"`);
    
    if (office.ibanHarc) {
      parts.push(`ibanHarc: "${office.ibanHarc}"`);
    }
    
    if (office.ibanCezaevi) {
      parts.push(`ibanCezaevi: "${office.ibanCezaevi}"`);
    }
    
    lines.push(`  { ${parts.join(', ')} },`);
  }
  
  return lines.join('\n');
}

// Ana fonksiyon
async function main() {
  console.log('🏛️ İcra Dairesi Banka Bilgileri Scraper');
  console.log('========================================\n');
  
  const allOffices: ProcessedOffice[] = [];
  
  // Her il için veri çek
  for (const [plakaKodu, ilAdi] of Object.entries(CITIES)) {
    console.log(`📍 ${ilAdi} (${plakaKodu}) verisi çekiliyor...`);
    
    try {
      // URL'yi oluştur - sayfa ID'si 18, il parametresi ile
      const url = `https://iidb.adalet.gov.tr/Home/SSSorularDetay/18?il=${plakaKodu}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`   ❌ HTTP ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const rawData = parseTableData(html);
      
      if (rawData.length === 0) {
        console.log(`   ⚠️ Veri bulunamadı`);
        continue;
      }
      
      const processed = processOffices(rawData, ilAdi);
      allOffices.push(...processed);
      
      console.log(`   ✅ ${processed.length} icra dairesi bulundu`);
      
      // Rate limiting - 500ms bekle
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`   ❌ Hata: ${error}`);
    }
  }
  
  console.log(`\n📊 Toplam ${allOffices.length} icra dairesi bulundu`);
  
  // Sonuçları dosyaya yaz
  const outputPath = path.join(__dirname, 'execution-offices-data.ts');
  const output = `// Otomatik oluşturuldu: ${new Date().toISOString()}
// Kaynak: https://iidb.adalet.gov.tr/Home/SSSorularDetay/18

export const EXECUTION_OFFICES_DATA = [
${toSeedFormat(allOffices)}
];
`;
  
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`\n💾 Veriler kaydedildi: ${outputPath}`);
}

main().catch(console.error);
