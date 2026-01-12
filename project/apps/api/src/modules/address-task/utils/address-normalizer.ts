import * as crypto from 'crypto';

/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştürür
 */
export function turkishToAscii(text: string): string {
  const map: Record<string, string> = {
    'İ': 'I', 'ı': 'I', 'I': 'I', 'i': 'I',
    'Ş': 'S', 'ş': 'S',
    'Ğ': 'G', 'ğ': 'G',
    'Ü': 'U', 'ü': 'U',
    'Ö': 'O', 'ö': 'O',
    'Ç': 'C', 'ç': 'C',
  };
  
  return text.split('').map(char => map[char] || char).join('');
}

/**
 * Yaygın kısaltmaları standartlaştırır
 */
export function standardizeAbbreviations(text: string): string {
  const abbreviations: [RegExp, string][] = [
    // Numara varyasyonları
    [/\bNO\s*[:.]\s*/gi, 'NO '],
    [/\bNO\s*$/gi, 'NO '],
    
    // Mahalle varyasyonları
    [/\bMAH\s*[.]\s*/gi, 'MAHALLESI '],
    [/\bMAHALLESI\b/gi, 'MAHALLESI'],
    
    // Cadde varyasyonları
    [/\bCAD\s*[.]\s*/gi, 'CADDESI '],
    [/\bCADDESI\b/gi, 'CADDESI'],
    
    // Sokak varyasyonları
    [/\bSK\s*[.]\s*/gi, 'SOKAK '],
    [/\bSOK\s*[.]\s*/gi, 'SOKAK '],
    [/\bSOKAK\b/gi, 'SOKAK'],
    
    // Bulvar varyasyonları
    [/\bBLV\s*[.]\s*/gi, 'BULVARI '],
    [/\bBULVARI\b/gi, 'BULVARI'],
    
    // Apartman varyasyonları
    [/\bAPT\s*[.]\s*/gi, 'APARTMANI '],
    [/\bAPARTMANI\b/gi, 'APARTMANI'],
    
    // Daire varyasyonları
    [/\bD\s*[:.]\s*/gi, 'DAIRE '],
    [/\bDAIRE\b/gi, 'DAIRE'],
    
    // Kat varyasyonları
    [/\bKT\s*[.]\s*/gi, 'KAT '],
    [/\bKAT\b/gi, 'KAT'],
    
    // Site varyasyonları
    [/\bSIT\s*[.]\s*/gi, 'SITESI '],
    [/\bSITESI\b/gi, 'SITESI'],
    
    // İlçe/İl
    [/\bILCE\s*[:.]\s*/gi, 'ILCE '],
    [/\bIL\s*[:.]\s*/gi, 'IL '],
  ];
  
  let result = text;
  for (const [pattern, replacement] of abbreviations) {
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

/**
 * Adresi normalize eder
 * - Türkçe karakterleri ASCII'ye çevirir
 * - Büyük harfe çevirir
 * - Çoklu boşlukları tek boşluğa indirger
 * - Satır sonlarını boşluğa çevirir
 * - Kısaltmaları standartlaştırır
 * - Baş ve sondaki boşlukları temizler
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';
  
  let normalized = address;
  
  // 1. Satır sonlarını boşluğa çevir
  normalized = normalized.replace(/[\r\n]+/g, ' ');
  
  // 2. Türkçe karakterleri ASCII'ye çevir
  normalized = turkishToAscii(normalized);
  
  // 3. Büyük harfe çevir
  normalized = normalized.toUpperCase();
  
  // 4. Kısaltmaları standartlaştır
  normalized = standardizeAbbreviations(normalized);
  
  // 5. Çoklu boşlukları tek boşluğa indirge
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 6. Baş ve sondaki boşlukları temizle
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * Normalize edilmiş adresin SHA-256 hash'ini üretir
 */
export function hashAddress(normalizedAddress: string): string {
  if (!normalizedAddress) return '';
  
  return crypto
    .createHash('sha256')
    .update(normalizedAddress, 'utf8')
    .digest('hex');
}

/**
 * Ham adresi normalize edip hash'ini üretir
 */
export function normalizeAndHashAddress(rawAddress: string): {
  normalized: string;
  hash: string;
} {
  const normalized = normalizeAddress(rawAddress);
  const hash = hashAddress(normalized);
  
  return { normalized, hash };
}
