/**
 * AI VALUATION PROMPT CONFIG v5
 * 
 * OpenAI ile araç/taşınmaz değerleme için prompt şablonları.
 * ai_valuation_prompt_v5.md'den TypeScript'e dönüştürülmüştür.
 */

// ==================== TYPES ====================

export interface VehicleValuationInput {
  plate: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  km?: number;
  fuel?: 'Dizel' | 'Benzin' | 'Hybrid' | 'EV' | 'LPG' | 'Unknown';
  transmission?: 'Otomatik' | 'Manuel' | 'Unknown';
  trim?: string;
  notes?: string;
  market: 'TR';
}

export interface RealEstateValuationInput {
  il: string;
  ilce: string;
  mahalle?: string;
  nitelik: string; // Arsa, Bina, Tarla, Daire, etc.
  yuzolcumu?: number; // m2
  katSayisi?: number;
  binaYasi?: number;
  odaSayisi?: string; // "3+1", "2+1", etc.
  isitmaTipi?: string;
  notes?: string;
  market: 'TR';
}

export interface ValuationOutput {
  modelVersion: string;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  confidence: number; // 0-1
  liquidationFactor: number; // 0-1
  reasoningBullets: string[];
  assumptions: {
    kmMissing?: boolean;
    conditionUnknown?: boolean;
    areaUnknown?: boolean;
    ageUnknown?: boolean;
  };
}

// ==================== VEHICLE VALUATION PROMPT ====================

export const VEHICLE_VALUATION_PROMPT = `
Aşağıdaki bilgileri kullanarak Türkiye pazarı için araç değer tahmini üret.

Girdi JSON:
{
  "plate": "{{plate}}",
  "make": "{{make}}",
  "model": "{{model}}",
  "year": {{year}},
  "vin": "{{vin}}",
  "km": {{km}},
  "fuel": "{{fuel}}",
  "transmission": "{{transmission}}",
  "trim": "{{trim}}",
  "notes": "{{notes}}",
  "market": "TR"
}

Çıktı JSON (yalnız JSON döndür):
{
  "model_version": "v5",
  "value_low": <number>,
  "value_mid": <number>,
  "value_high": <number>,
  "confidence": <0..1>,
  "liquidation_factor": <0..1>,
  "reasoning_bullets": ["...","...","..."],
  "assumptions": {"km_missing": true/false, "condition_unknown": true/false}
}

Kurallar:
- Bilgi eksikse confidence düşür, value bandını genişlet.
- Likidite faktörünü segment/yaş/araç türüne göre belirle:
  - Lüks/spor araçlar: 0.55-0.65
  - Orta segment: 0.65-0.75
  - Ekonomik/ticari: 0.70-0.80
- TL cinsinden üret.
- Güncel Türkiye ikinci el araç piyasasını baz al.
- Hasar, tramer, boya notları varsa değeri düşür.
- Ticari kullanım varsa değeri düşür.
`;

// ==================== REAL ESTATE VALUATION PROMPT ====================

export const REAL_ESTATE_VALUATION_PROMPT = `
Aşağıdaki bilgileri kullanarak Türkiye pazarı için taşınmaz değer tahmini üret.

Girdi JSON:
{
  "il": "{{il}}",
  "ilce": "{{ilce}}",
  "mahalle": "{{mahalle}}",
  "nitelik": "{{nitelik}}",
  "yuzolcumu": {{yuzolcumu}},
  "kat_sayisi": {{katSayisi}},
  "bina_yasi": {{binaYasi}},
  "oda_sayisi": "{{odaSayisi}}",
  "isitma_tipi": "{{isitmaTipi}}",
  "notes": "{{notes}}",
  "market": "TR"
}

Çıktı JSON (yalnız JSON döndür):
{
  "model_version": "v5",
  "value_low": <number>,
  "value_mid": <number>,
  "value_high": <number>,
  "confidence": <0..1>,
  "liquidation_factor": <0..1>,
  "reasoning_bullets": ["...","...","..."],
  "assumptions": {"area_unknown": true/false, "age_unknown": true/false}
}

Kurallar:
- Bilgi eksikse confidence düşür, value bandını genişlet.
- Likidite faktörünü lokasyon/nitelik/yaşa göre belirle:
  - Merkezi lokasyon konut: 0.75-0.85
  - Çevre lokasyon konut: 0.65-0.75
  - Arsa: 0.70-0.80
  - Ticari: 0.60-0.70
  - Tarla: 0.50-0.65
- TL cinsinden üret.
- Güncel Türkiye emlak piyasasını baz al.
- İmar durumu, kat irtifakı, iskan durumu notları varsa değerlendir.
`;

// ==================== PROMPT BUILDER ====================

/**
 * Araç değerleme prompt'u oluştur
 */
export function buildVehicleValuationPrompt(input: VehicleValuationInput): string {
  let prompt = VEHICLE_VALUATION_PROMPT;
  
  prompt = prompt.replace('{{plate}}', input.plate || '');
  prompt = prompt.replace('{{make}}', input.make || '');
  prompt = prompt.replace('{{model}}', input.model || '');
  prompt = prompt.replace('{{year}}', String(input.year || 0));
  prompt = prompt.replace('{{vin}}', input.vin || '');
  prompt = prompt.replace('{{km}}', input.km ? String(input.km) : 'null');
  prompt = prompt.replace('{{fuel}}', input.fuel || 'Unknown');
  prompt = prompt.replace('{{transmission}}', input.transmission || 'Unknown');
  prompt = prompt.replace('{{trim}}', input.trim || '');
  prompt = prompt.replace('{{notes}}', input.notes || '');
  
  return prompt;
}

/**
 * Taşınmaz değerleme prompt'u oluştur
 */
export function buildRealEstateValuationPrompt(input: RealEstateValuationInput): string {
  let prompt = REAL_ESTATE_VALUATION_PROMPT;
  
  prompt = prompt.replace('{{il}}', input.il || '');
  prompt = prompt.replace('{{ilce}}', input.ilce || '');
  prompt = prompt.replace('{{mahalle}}', input.mahalle || '');
  prompt = prompt.replace('{{nitelik}}', input.nitelik || '');
  prompt = prompt.replace('{{yuzolcumu}}', input.yuzolcumu ? String(input.yuzolcumu) : 'null');
  prompt = prompt.replace('{{katSayisi}}', input.katSayisi ? String(input.katSayisi) : 'null');
  prompt = prompt.replace('{{binaYasi}}', input.binaYasi ? String(input.binaYasi) : 'null');
  prompt = prompt.replace('{{odaSayisi}}', input.odaSayisi || '');
  prompt = prompt.replace('{{isitmaTipi}}', input.isitmaTipi || '');
  prompt = prompt.replace('{{notes}}', input.notes || '');
  
  return prompt;
}

/**
 * AI yanıtını parse et
 */
export function parseValuationResponse(response: string): ValuationOutput | null {
  try {
    // JSON bloğunu bul
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      modelVersion: parsed.model_version || 'v5',
      valueLow: parsed.value_low || 0,
      valueMid: parsed.value_mid || 0,
      valueHigh: parsed.value_high || 0,
      confidence: parsed.confidence || 0,
      liquidationFactor: parsed.liquidation_factor || 0.65,
      reasoningBullets: parsed.reasoning_bullets || [],
      assumptions: {
        kmMissing: parsed.assumptions?.km_missing,
        conditionUnknown: parsed.assumptions?.condition_unknown,
        areaUnknown: parsed.assumptions?.area_unknown,
        ageUnknown: parsed.assumptions?.age_unknown,
      },
    };
  } catch (e) {
    console.error('AI valuation parse error:', e);
    return null;
  }
}

// ==================== LIQUIDATION FACTORS ====================

/**
 * Araç segmentine göre likidite faktörü
 */
export function getVehicleLiquidationFactor(
  make: string,
  year: number,
  isCommercial: boolean = false
): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  // Lüks markalar
  const luxuryBrands = ['BMW', 'Mercedes', 'Audi', 'Porsche', 'Lexus', 'Jaguar', 'Land Rover', 'Volvo'];
  const isLuxury = luxuryBrands.some(b => make.toUpperCase().includes(b.toUpperCase()));
  
  // Ticari araç
  if (isCommercial) {
    return age <= 5 ? 0.75 : age <= 10 ? 0.70 : 0.60;
  }
  
  // Lüks araç
  if (isLuxury) {
    return age <= 3 ? 0.65 : age <= 7 ? 0.60 : 0.55;
  }
  
  // Normal araç
  return age <= 5 ? 0.75 : age <= 10 ? 0.70 : 0.65;
}

/**
 * Taşınmaz niteliğine göre likidite faktörü
 */
export function getRealEstateLiquidationFactor(
  nitelik: string,
  il: string
): number {
  // Büyükşehirler
  const majorCities = ['İSTANBUL', 'ANKARA', 'İZMİR', 'BURSA', 'ANTALYA', 'ADANA'];
  const isMajorCity = majorCities.some(c => il.toUpperCase().includes(c));
  
  const nitelikLower = nitelik.toLowerCase();
  
  // Konut
  if (nitelikLower.includes('daire') || nitelikLower.includes('konut') || nitelikLower.includes('mesken')) {
    return isMajorCity ? 0.80 : 0.70;
  }
  
  // Arsa
  if (nitelikLower.includes('arsa')) {
    return isMajorCity ? 0.75 : 0.65;
  }
  
  // Ticari
  if (nitelikLower.includes('dükkan') || nitelikLower.includes('işyeri') || nitelikLower.includes('ofis')) {
    return isMajorCity ? 0.70 : 0.60;
  }
  
  // Tarla
  if (nitelikLower.includes('tarla') || nitelikLower.includes('bahçe') || nitelikLower.includes('zeytinlik')) {
    return 0.55;
  }
  
  // Diğer
  return 0.60;
}

// ==================== CONFIDENCE ADJUSTMENTS ====================

/**
 * Eksik bilgilere göre güven skorunu ayarla
 */
export function adjustConfidenceForMissingData(
  baseConfidence: number,
  missingFields: string[]
): number {
  let adjustment = 0;
  
  const fieldPenalties: Record<string, number> = {
    km: 0.15,
    year: 0.20,
    condition: 0.10,
    yuzolcumu: 0.15,
    binaYasi: 0.10,
    mahalle: 0.05,
  };
  
  for (const field of missingFields) {
    adjustment += fieldPenalties[field] || 0.05;
  }
  
  return Math.max(0.1, baseConfidence - adjustment);
}
