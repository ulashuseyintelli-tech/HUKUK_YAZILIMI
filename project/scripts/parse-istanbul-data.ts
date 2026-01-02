/**
 * İstanbul İcra Dairesi Verilerini Parse Et
 * 
 * iidb.adalet.gov.tr'den çekilen İstanbul verilerini seed formatına dönüştürür.
 */

interface RawOffice {
  birimAdi: string;
  vergiNo: string;
  hesapTuru: string;
  iban: string;
}

interface ProcessedOffice {
  city: string;
  district?: string;
  name: string;
  uyapCode: string;
  taxNumber: string;
  bankName: string;
  iban: string;
  ibanHarc: string;
  ibanCezaevi: string;
}

// Raw data from the website
const rawData: RawOffice[] = [
  // Adalar
  { birimAdi: "Adalar İcra Dairesi", vergiNo: "", hesapTuru: "Cezaevi", iban: "TR920001500158007300720067" },
  { birimAdi: "Adalar İcra Dairesi", vergiNo: "", hesapTuru: "Emanet", iban: "TR350001500158007300720026" },
  { birimAdi: "Adalar İcra Dairesi", vergiNo: "", hesapTuru: "Harç", iban: "TR230001500158007300720048" },
  
  // Bakırköy 1
  { birimAdi: "Bakırköy 1. İcra Dairesi", vergiNo: "1320067729", hesapTuru: "Harç", iban: "TR090001500158007290498731" },
  { birimAdi: "Bakırköy 1. İcra Dairesi", vergiNo: "1320067729", hesapTuru: "Cezaevi", iban: "TR080001500158007299331084" },
  { birimAdi: "Bakırköy 1. İcra Dairesi", vergiNo: "1320067729", hesapTuru: "Emanet", iban: "TR670001500158007290498754" },
  
  // ... (tüm veriler buraya eklenecek)
];

// İlçe adını çıkar
function extractDistrict(birimAdi: string): string | undefined {
  // İstanbul merkez daireleri
  if (birimAdi.match(/^İstanbul \d+\. İcra Dairesi$/)) return undefined;
  if (birimAdi.match(/^İstanbul \d+\. İflas Dairesi$/)) return undefined;
  if (birimAdi.includes("İstanbul Anadolu")) return "Anadolu";
  if (birimAdi.includes("İstanbul Abonelik")) return undefined;
  if (birimAdi.includes("İstanbul Gayrimenkul")) return undefined;
  
  // İlçe daireleri
  const districtMatch = birimAdi.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü]+)(?:\s+\d+\.)?\s+İcra Dairesi$/);
  if (districtMatch) {
    const district = districtMatch[1];
    if (district !== "İstanbul") return district;
  }
  
  return undefined;
}

// Verileri grupla ve işle
function processData(data: RawOffice[]): ProcessedOffice[] {
  const grouped = new Map<string, { emanet?: RawOffice; harc?: RawOffice; cezaevi?: RawOffice }>();
  
  for (const row of data) {
    const key = row.birimAdi;
    if (!grouped.has(key)) {
      grouped.set(key, {});
    }
    
    const group = grouped.get(key)!;
    const hesapTuru = row.hesapTuru.toLowerCase();
    
    if (hesapTuru.includes("emanet")) group.emanet = row;
    else if (hesapTuru.includes("harç")) group.harc = row;
    else if (hesapTuru.includes("cezaevi")) group.cezaevi = row;
  }
  
  const results: ProcessedOffice[] = [];
  
  for (const [birimAdi, accounts] of grouped) {
    const baseData = accounts.emanet || accounts.harc || accounts.cezaevi;
    if (!baseData) continue;
    
    results.push({
      city: "İSTANBUL",
      district: extractDistrict(birimAdi),
      name: birimAdi,
      uyapCode: baseData.vergiNo || "",
      taxNumber: baseData.vergiNo || "",
      bankName: "T. Vakıflar Bankası T.A.O.",
      iban: accounts.emanet?.iban || "",
      ibanHarc: accounts.harc?.iban || "",
      ibanCezaevi: accounts.cezaevi?.iban || ""
    });
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

// Seed formatına dönüştür
function toSeedFormat(offices: ProcessedOffice[]): string {
  const lines: string[] = [];
  
  for (const office of offices) {
    const parts: string[] = [`city: "${office.city}"`];
    
    if (office.district) parts.push(`district: "${office.district}"`);
    parts.push(`name: "${office.name}"`);
    parts.push(`uyapCode: "${office.uyapCode}"`);
    if (office.taxNumber) parts.push(`taxNumber: "${office.taxNumber}"`);
    parts.push(`bankName: "${office.bankName}"`);
    parts.push(`iban: "${office.iban}"`);
    if (office.ibanHarc) parts.push(`ibanHarc: "${office.ibanHarc}"`);
    if (office.ibanCezaevi) parts.push(`ibanCezaevi: "${office.ibanCezaevi}"`);
    
    lines.push(`  { ${parts.join(", ")} },`);
  }
  
  return lines.join("\n");
}

const processed = processData(rawData);
console.log(`// İSTANBUL (34) - ${processed.length} icra dairesi`);
console.log(toSeedFormat(processed));
