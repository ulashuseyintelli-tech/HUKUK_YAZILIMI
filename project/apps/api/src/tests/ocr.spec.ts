import { OcrService, DetectedCaseType, DetectedSubCategory } from "../modules/ocr/ocr.service";
import { ConfigService } from "@nestjs/config";

describe("OcrService - Belge Sınıflandırma", () => {
  let ocrService: OcrService;

  beforeEach(() => {
    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    } as unknown as ConfigService;
    
    ocrService = new OcrService(mockConfigService);
  });

  describe("İlamlı Takip Tespiti", () => {
    it("Mahkeme kararı içeren metni İLAMLI olarak sınıflandırmalı", () => {
      const text = `
        T.C.
        İSTANBUL 5. ASLİYE HUKUK MAHKEMESİ
        ESAS NO: 2024/1234
        KARAR NO: 2024/5678
        
        HÜKÜM: Davalının davacıya 50.000 TL tazminat ödemesine,
        yasal faizi ile birlikte tahsiline karar verilmiştir.
        
        Karar Tarihi: 15.10.2024
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.ILAMLI);
      expect(result.detectedSubCategory).toBe(DetectedSubCategory.GENEL);
      expect(result.confidence).toBeGreaterThan(50);
      expect(result.matchedKeywords).toContain("mahkemesi");
      expect(result.matchedKeywords).toContain("karar no");
    });

    it("Nafaka içeren metni İLAMLI_NAFAKA olarak sınıflandırmalı", () => {
      const text = `
        T.C.
        ANKARA AİLE MAHKEMESİ
        ESAS NO: 2024/999
        
        HÜKÜM: Davalının davacıya aylık 5.000 TL yoksulluk nafakası
        ödemesine, her ay düzenli ödeme yapılmasına karar verilmiştir.
        
        İştirak nafakası olarak çocuk için aylık 3.000 TL belirlendi.
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.ILAMLI);
      expect(result.detectedSubCategory).toBe(DetectedSubCategory.NAFAKA);
      expect(result.matchedKeywords).toContain("nafaka");
    });

    it("Döviz alacağı içeren metni İLAMLI_DOVIZ olarak sınıflandırmalı", () => {
      const text = `
        T.C.
        İSTANBUL TİCARET MAHKEMESİ
        ESAS NO: 2024/555
        
        HÜKÜM: Davalının davacıya 10.000 USD döviz cinsinden alacağın
        fiili ödeme tarihindeki T.C. Merkez Bankası efektif kur üzerinden
        Türk Lirası karşılığının tahsiline karar verilmiştir.
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.ILAMLI);
      expect(result.detectedSubCategory).toBe(DetectedSubCategory.DOVIZ);
      expect(result.matchedKeywords).toContain("usd");
    });
  });

  describe("Kambiyo Takibi Tespiti", () => {
    it("Bono içeren metni KAMBIYO olarak sınıflandırmalı", () => {
      const text = `
        BONO
        Emre Muharrer Senet
        
        Vade Tarihi: 01.12.2024
        Keşide Tarihi: 01.06.2024
        Tutar: 100.000 TL
        
        Keşideci: Ahmet Yılmaz
        Lehtar: Mehmet Demir
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.KAMBIYO);
      expect(result.suggestedFormCode).toBe("FORM_10");
    });

    it("Çek içeren metni KAMBIYO olarak sınıflandırmalı", () => {
      const text = `
        ÇEK
        Banka: Türkiye İş Bankası
        Çek No: 123456
        Keşide Tarihi: 15.11.2024
        Tutar: 50.000 TL
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.KAMBIYO);
    });
  });

  describe("Kira Takibi Tespiti", () => {
    it("Kira sözleşmesi içeren metni KIRA olarak sınıflandırmalı", () => {
      const text = `
        KİRA SÖZLEŞMESİ
        
        Kiraya Veren: Ali Veli
        Kiracı: Ayşe Fatma
        
        Aylık Kira Bedeli: 15.000 TL
        Kira borcu nedeniyle tahliye talep edilmektedir.
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.KIRA);
      expect(result.matchedKeywords).toContain("kira bedeli");
    });
  });

  describe("İpotek Takibi Tespiti", () => {
    it("İpotek içeren metni IPOTEK olarak sınıflandırmalı", () => {
      const text = `
        TAPU SİCİL MÜDÜRLÜĞÜ
        
        Ada: 1234
        Parsel: 56
        
        İpotek tutarı: 500.000 TL
        Rehnin paraya çevrilmesi talep edilmektedir.
        Gayrimenkul üzerinde teminat bulunmaktadır.
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.IPOTEK);
    });
  });

  describe("Belirsiz Belge", () => {
    it("Tanınmayan metni UNKNOWN olarak sınıflandırmalı", () => {
      const text = "Bu bir test metnidir. Hiçbir anahtar kelime içermez.";

      const result = ocrService.classifyDocument(text);

      expect(result.detectedType).toBe(DetectedCaseType.UNKNOWN);
      expect(result.confidence).toBeLessThan(50);
    });
  });

  describe("Güven Skoru", () => {
    it("Çok sayıda keyword eşleşmesinde yüksek güven skoru vermeli", () => {
      const text = `
        T.C. İstanbul Mahkemesi
        Esas No: 2024/1
        Karar No: 2024/2
        Hüküm verildi
        Karar Tarihi: 01.01.2024
        Faiz hesaplanacak
      `;

      const result = ocrService.classifyDocument(text);

      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it("Az keyword eşleşmesinde düşük güven skoru vermeli", () => {
      const text = "Mahkemesi kararı";

      const result = ocrService.classifyDocument(text);

      expect(result.confidence).toBeLessThan(50);
    });
  });
});
