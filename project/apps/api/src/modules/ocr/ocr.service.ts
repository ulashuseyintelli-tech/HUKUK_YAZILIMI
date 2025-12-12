import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Tesseract from "tesseract.js";
import * as sharp from "sharp";
import * as AdmZip from "adm-zip";
import * as mammoth from "mammoth";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfPoppler = require("pdf-poppler");

/**
 * Belge Sınıflandırma Sonucu
 */
export interface ClassificationResult {
  detectedType: DetectedCaseType;
  detectedSubCategory: DetectedSubCategory | null;
  confidence: number; // 0-100
  matchedKeywords: string[];
  suggestedFormCode: string | null;
  explanation: string;
}

export enum DetectedCaseType {
  ILAMLI = "ILAMLI",
  ILAMSIZ = "ILAMSIZ",
  KAMBIYO = "KAMBIYO",
  KIRA = "KIRA",
  IPOTEK = "IPOTEK",
  REHIN = "REHIN",
  UNKNOWN = "UNKNOWN",
}

export enum DetectedSubCategory {
  GENEL = "GENEL",
  NAFAKA = "NAFAKA",
  DOVIZ = "DOVIZ",
  KIRA = "KIRA",
}

/**
 * Vekaletname tarama sonucu
 */
export interface PowerOfAttorneyResult {
  // Müvekkil bilgileri
  clientType: "PERSON" | "COMPANY" | "PUBLIC";
  firstName?: string;
  lastName?: string;
  companyName?: string;
  tckn?: string;
  vkn?: string;
  taxOffice?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  // Vekaletname bilgileri
  poaNumber?: string;
  poaDate?: string;
  notaryName?: string;
  notaryCity?: string;
  // Yetkiler
  canCollect: boolean;
  canWaive: boolean;
  canSettle: boolean;
  canRelease: boolean;
  // Avukat bilgileri
  lawyerName?: string;
  lawyerBarNumber?: string;
  lawyerBarCity?: string;
  // Meta
  confidence: number;
  rawText?: string;
}

/**
 * Keyword grupları - belge sınıflandırma için
 */
const KEYWORD_GROUPS = {
  // İlamlı alacak için
  ILAMLI: [
    "t.c.",
    "mahkemesi",
    "esas no",
    "karar no",
    "hüküm",
    "karar tarihi",
    "mahkeme kararı",
    "ilam",
    "kesinleşme",
    "kesinleşmiş",
    "icra edilebilirlik",
    "hükmedilen",
    "tazminat",
    "alacağın tahsili",
  ],

  // Nafaka için
  NAFAKA: [
    "yoksulluk nafakası",
    "iştirak nafakası",
    "tedbir nafakası",
    "nafaka",
    "her ay ödenecek",
    "aylık",
    "düzenli ödeme",
    "nafaka alacağı",
    "çocuk nafakası",
  ],

  // Döviz alacağı için
  DOVIZ: [
    "usd",
    "eur",
    "euro",
    "dolar",
    "amerikan doları",
    "efektif kur",
    "fiili ödeme tarihi",
    "döviz cinsinden",
    "yabancı para",
    "kur farkı",
    "döviz alacağı",
    "gbp",
    "sterlin",
    "chf",
    "frank",
  ],

  // Kambiyo için (Çek, Bono, Poliçe)
  KAMBIYO: [
    // Çek spesifik - ana ibareler
    "bu çek karşılığında",
    "buçek karşılığında",
    "bu cek karşılığında",
    "çek karşılığında",
    "cek karşılığında",
    "karşılığında",
    "karsiligi",
    "karşılığı",
    "ödeyiniz",
    "odeyiniz",
    "hesabımdan",
    "hesabimdan",
    // Keşideci varyasyonları (OCR hataları için)
    "keşidecinin",
    "kesidecinin",
    "keşideci",
    "kesideci",
    "keşide",
    "keside",
    // Çek üzerindeki alanlar
    "banka",
    "bankası",
    "bankasi",
    "şube",
    "sube",
    "hesap no",
    "hesap numarası",
    "iban",
    "çek no",
    "cek no",
    "seri no",
    "seri",
    // Genel kambiyo terimleri
    "bono",
    "poliçe",
    "police",
    "emre muharrer",
    "muharrer",
    "çek",
    "cek",
    "senet",
    "vade",
    "tarih",
    "hamiline",
    "emrine",
    "protesto",
    "ciro",
    "ciranta",
    "lehtar",
    // Para/tutar ifadeleri
    "tl",
    "türk lirası",
    "turk lirasi",
    "yalnız",
    "yalniz",
    "#",
    // Banka isimleri
    "ziraat",
    "garanti",
    "akbank",
    "yapı kredi",
    "yapi kredi",
    "iş bankası",
    "is bankasi",
    "halkbank",
    "vakıfbank",
    "vakifbank",
    "denizbank",
    "qnb",
    "finansbank",
    "teb",
    "ing",
    "hsbc",
    "kuveyt",
    "albaraka",
    "şekerbank",
    "sekerbank",
    "anadolu",
  ],

  // Kira için
  KIRA: [
    "kira bedeli",
    "tahliye",
    "kira sözleşmesi",
    "kiracı",
    "kiraya veren",
    "kira alacağı",
    "aylık kira",
    "kira borcu",
    "tahliye taahhütnamesi",
    "ihtarname",
  ],

  // Rehin / ipotek için
  IPOTEK: [
    "ipotek",
    "ada",
    "parsel",
    "tapu sicil müdürlüğü",
    "rehnin paraya çevrilmesi",
    "taşınmaz rehni",
    "gayrimenkul",
    "tapu",
    "teminat",
    "ipotekli",
  ],
};

/**
 * Form kodu eşleştirme tablosu
 */
const FORM_MAPPING: Record<DetectedCaseType, Record<string, string>> = {
  [DetectedCaseType.ILAMLI]: {
    default: "FORM_1",
    NAFAKA: "FORM_1", // İlamlı nafaka
    DOVIZ: "FORM_1", // İlamlı döviz
    GENEL: "FORM_1", // İlamlı genel
  },
  [DetectedCaseType.ILAMSIZ]: {
    default: "FORM_7",
    GENEL: "FORM_7",
  },
  [DetectedCaseType.KAMBIYO]: {
    default: "FORM_10",
  },
  [DetectedCaseType.KIRA]: {
    default: "FORM_13",
  },
  [DetectedCaseType.IPOTEK]: {
    default: "FORM_17",
  },
  [DetectedCaseType.REHIN]: {
    default: "FORM_19",
  },
  [DetectedCaseType.UNKNOWN]: {
    default: "FORM_7",
  },
};

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private openai: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey && apiKey !== "sk-your-openai-api-key-here") {
      this.openai = new OpenAI({ apiKey });
      this.logger.log("OpenAI client initialized for OCR classification");
    }
  }

  /**
   * Metin içeriğinden belge türünü sınıflandır (Rule-Based)
   */
  classifyDocument(textContent: string): ClassificationResult {
    const normalizedText = textContent.toLowerCase().trim();
    const matchedKeywords: string[] = [];
    const scores: Record<string, number> = {};

    // Her kategori için keyword eşleştirmesi yap
    for (const [category, keywords] of Object.entries(KEYWORD_GROUPS)) {
      scores[category] = 0;
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          scores[category]++;
          matchedKeywords.push(keyword);
        }
      }
    }

    // En yüksek skoru bul
    let maxCategory = "UNKNOWN";
    let maxScore = 0;
    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxCategory = category;
      }
    }

    // Confidence hesapla (max 100)
    const totalKeywords = Object.values(KEYWORD_GROUPS).flat().length;
    const confidence = Math.min(100, Math.round((maxScore / 5) * 100)); // 5+ keyword = %100

    // Detected type belirle
    let detectedType: DetectedCaseType;
    let detectedSubCategory: DetectedSubCategory | null = null;

    switch (maxCategory) {
      case "ILAMLI":
        detectedType = DetectedCaseType.ILAMLI;
        // Alt kategori belirle
        if (scores["NAFAKA"] > 0) {
          detectedSubCategory = DetectedSubCategory.NAFAKA;
        } else if (scores["DOVIZ"] > 0) {
          detectedSubCategory = DetectedSubCategory.DOVIZ;
        } else {
          detectedSubCategory = DetectedSubCategory.GENEL;
        }
        break;
      case "NAFAKA":
        detectedType = DetectedCaseType.ILAMLI;
        detectedSubCategory = DetectedSubCategory.NAFAKA;
        break;
      case "DOVIZ":
        // Döviz tek başına ilamsız olabilir, ama genelde ilamlı
        detectedType =
          scores["ILAMLI"] > 0
            ? DetectedCaseType.ILAMLI
            : DetectedCaseType.ILAMSIZ;
        detectedSubCategory = DetectedSubCategory.DOVIZ;
        break;
      case "KAMBIYO":
        detectedType = DetectedCaseType.KAMBIYO;
        break;
      case "KIRA":
        detectedType = DetectedCaseType.KIRA;
        detectedSubCategory = DetectedSubCategory.KIRA;
        break;
      case "IPOTEK":
        detectedType = DetectedCaseType.IPOTEK;
        break;
      default:
        detectedType = DetectedCaseType.UNKNOWN;
    }

    // Form kodu öner
    const formMapping = FORM_MAPPING[detectedType];
    const suggestedFormCode =
      formMapping[detectedSubCategory || "default"] || formMapping["default"];

    // Açıklama oluştur
    const explanation = this.generateExplanation(
      detectedType,
      detectedSubCategory,
      matchedKeywords,
      confidence
    );

    this.logger.log(
      `Belge sınıflandırıldı: ${detectedType} / ${detectedSubCategory} (Güven: %${confidence})`
    );

    return {
      detectedType,
      detectedSubCategory,
      confidence,
      matchedKeywords: [...new Set(matchedKeywords)], // Unique keywords
      suggestedFormCode,
      explanation,
    };
  }

  /**
   * Açıklama metni oluştur
   */
  private generateExplanation(
    type: DetectedCaseType,
    subCategory: DetectedSubCategory | null,
    keywords: string[],
    confidence: number
  ): string {
    const typeNames: Record<DetectedCaseType, string> = {
      [DetectedCaseType.ILAMLI]: "İlamlı Takip",
      [DetectedCaseType.ILAMSIZ]: "İlamsız Takip",
      [DetectedCaseType.KAMBIYO]: "Kambiyo Senetlerine Özgü Takip",
      [DetectedCaseType.KIRA]: "Kira Alacağı Takibi",
      [DetectedCaseType.IPOTEK]: "İpoteğin Paraya Çevrilmesi",
      [DetectedCaseType.REHIN]: "Rehnin Paraya Çevrilmesi",
      [DetectedCaseType.UNKNOWN]: "Belirsiz",
    };

    const subCategoryNames: Record<DetectedSubCategory, string> = {
      [DetectedSubCategory.GENEL]: "Genel Alacak",
      [DetectedSubCategory.NAFAKA]: "Nafaka Alacağı",
      [DetectedSubCategory.DOVIZ]: "Döviz Alacağı",
      [DetectedSubCategory.KIRA]: "Kira Alacağı",
    };

    let explanation = `Belgeniz "${typeNames[type]}" kategorisine uygun görünüyor.`;

    if (subCategory) {
      explanation += ` Alt kategori: ${subCategoryNames[subCategory]}.`;
    }

    if (confidence >= 80) {
      explanation += " Yüksek güvenle bu takip türünü öneriyoruz.";
    } else if (confidence >= 50) {
      explanation += " Orta düzeyde güvenle bu öneriyi sunuyoruz.";
    } else {
      explanation +=
        " Düşük güven seviyesi - lütfen manuel olarak kontrol edin.";
    }

    if (keywords.length > 0) {
      explanation += ` Tespit edilen anahtar kelimeler: ${keywords.slice(0, 5).join(", ")}${keywords.length > 5 ? "..." : ""}.`;
    }

    return explanation;
  }

  /**
   * OpenAI ile belge sınıflandırma (AI modu)
   */
  async classifyDocumentWithAI(textContent: string): Promise<ClassificationResult> {
    if (!this.openai) {
      this.logger.warn("OpenAI not configured, falling back to rule-based");
      return this.classifyDocument(textContent);
    }

    const model = this.configService.get<string>("OPENAI_MODEL") || "gpt-3.5-turbo";
    
    try {
      this.logger.log("OpenAI ile belge sınıflandırma başlatılıyor...");
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Sen bir Türk icra-iflas hukuku uzmanısın. Verilen belge metnini analiz ederek takip türünü belirle.

Takip türleri:
- ILAMLI: Mahkeme kararı, ilam, kesinleşmiş karar
- KAMBIYO: Çek, bono, poliçe, senet
- ILAMSIZ: Fatura, sözleşme, genel alacak
- KIRA: Kira sözleşmesi, tahliye
- IPOTEK: İpotek, tapu, gayrimenkul teminat
- REHIN: Rehin, taşınır teminat

Alt kategoriler (sadece ILAMLI için):
- GENEL: Tek seferlik para alacağı
- NAFAKA: Aylık nafaka ödemesi
- DOVIZ: Yabancı para alacağı (USD, EUR vb.)

JSON formatında yanıt ver:
{
  "detectedType": "ILAMLI|KAMBIYO|ILAMSIZ|KIRA|IPOTEK|REHIN|UNKNOWN",
  "detectedSubCategory": "GENEL|NAFAKA|DOVIZ|null",
  "confidence": 0-100,
  "matchedKeywords": ["kelime1", "kelime2"],
  "suggestedFormCode": "FORM_1|FORM_7|FORM_10|FORM_13|FORM_17|FORM_19",
  "explanation": "Türkçe açıklama"
}`
          },
          {
            role: "user",
            content: `Aşağıdaki belge metnini analiz et ve takip türünü belirle:\n\n${textContent.substring(0, 3000)}`
          }
        ],
        temperature: 0.2,
        // gpt-3.5-turbo ve gpt-4 için max_tokens, o1 modelleri için max_completion_tokens
        ...(model.startsWith("o1") ? { max_completion_tokens: 500 } : { max_tokens: 500 }),
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`OpenAI yanıtı: ${content}`);
      
      const parsed = JSON.parse(content);
      
      // Enum değerlerine dönüştür
      const detectedType = (DetectedCaseType[parsed.detectedType as keyof typeof DetectedCaseType]) || DetectedCaseType.UNKNOWN;
      const detectedSubCategory = parsed.detectedSubCategory 
        ? (DetectedSubCategory[parsed.detectedSubCategory as keyof typeof DetectedSubCategory]) || null
        : null;

      this.logger.log(`AI Sınıflandırma: ${detectedType} / ${detectedSubCategory} (Güven: %${parsed.confidence})`);

      return {
        detectedType,
        detectedSubCategory,
        confidence: parsed.confidence || 70,
        matchedKeywords: parsed.matchedKeywords || [],
        suggestedFormCode: parsed.suggestedFormCode || null,
        explanation: parsed.explanation || "AI tarafından analiz edildi.",
      };
    } catch (error) {
      this.logger.error("OpenAI sınıflandırma hatası:", error);
      // Fallback to rule-based
      return this.classifyDocument(textContent);
    }
  }

  /**
   * UDF dosyasından metin çıkar (UYAP formatı)
   * UDF = ZIP içinde content.xml + documentproperties.xml + sign.sgn
   */
  async extractTextFromUdf(buffer: Buffer): Promise<{ text: string; metadata: Record<string, string> }> {
    try {
      this.logger.log("UDF dosyası açılıyor...");
      
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      
      this.logger.log(`UDF içinde ${zipEntries.length} dosya bulundu`);
      
      let contentText = "";
      const metadata: Record<string, string> = {};
      
      for (const entry of zipEntries) {
        this.logger.debug(`UDF dosya: ${entry.entryName}`);
        
        if (entry.entryName === "content.xml") {
          // Ana içerik - CDATA içindeki metin
          const contentXml = entry.getData().toString("utf-8");
          
          // CDATA içeriğini çıkar
          const cdataMatch = contentXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
          if (cdataMatch) {
            contentText = cdataMatch[1];
            this.logger.log(`content.xml'den ${contentText.length} karakter çıkarıldı`);
          } else {
            // CDATA yoksa tüm content tag'ini al
            const contentMatch = contentXml.match(/<content>([\s\S]*?)<\/content>/);
            if (contentMatch) {
              contentText = contentMatch[1];
            }
          }
        } else if (entry.entryName === "documentproperties.xml") {
          // Meta veriler
          const propsXml = entry.getData().toString("utf-8");
          
          // entry key="xxx" değerlerini çıkar
          const entryRegex = /<entry key="([^"]+)">([^<]*)<\/entry>/g;
          let match;
          while ((match = entryRegex.exec(propsXml)) !== null) {
            metadata[match[1]] = match[2];
            this.logger.debug(`UDF meta: ${match[1]} = ${match[2]}`);
          }
        }
      }
      
      if (!contentText) {
        throw new Error("UDF dosyasında içerik bulunamadı");
      }
      
      // Metin temizleme
      const cleanedText = this.cleanOcrText(contentText);
      
      this.logger.log(`UDF başarıyla okundu. Metin: ${cleanedText.length} karakter, Meta: ${Object.keys(metadata).length} alan`);
      
      return { text: cleanedText, metadata };
    } catch (error: any) {
      this.logger.error("UDF okuma hatası:", error);
      throw new Error(`UDF dosyası okunamadı: ${error.message}`);
    }
  }

  /**
   * PDF'den metin çıkar
   * @returns Metin veya null (bozuk encoding durumunda)
   */
  async extractTextFromPdf(buffer: Buffer): Promise<string | null> {
    try {
      this.logger.log("PDF metin çıkarma başlatılıyor...");
      
      // Dosya başlangıcını kontrol et
      const header = buffer.slice(0, 10).toString("utf-8");
      this.logger.debug(`Dosya header: ${header}`);
      
      // PDF mi kontrol et
      if (!header.startsWith("%PDF")) {
        this.logger.warn("Dosya standart PDF formatında değil, alternatif yöntem deneniyor...");
        // UDF dosyaları bazen farklı formatta olabilir
        // Dosyayı text olarak okumayı dene
        const textContent = buffer.toString("utf-8");
        if (textContent.length > 100) {
          return this.cleanOcrText(textContent);
        }
        throw new Error("UDF dosyası okunamadı. Dosya şifreli veya özel formatta olabilir.");
      }
      
      const data = await pdfParse(buffer);
      const extractedText = data.text;
      
      this.logger.log(`PDF'den ${extractedText.length} karakter çıkarıldı. Sayfa sayısı: ${data.numpages}`);
      
      // Metin temizleme
      const cleanedText = this.cleanOcrText(extractedText);
      
      // Debug: Çıkarılan metni logla
      this.logger.debug(`PDF metin (ilk 500 karakter): ${cleanedText.substring(0, 500)}`);
      
      // Metnin geçerli olup olmadığını kontrol et (bozuk encoding tespiti)
      if (!this.isValidText(cleanedText)) {
        this.logger.warn("PDF metni bozuk encoding içeriyor, OCR deneniyor...");
        return null; // OCR'a fallback için null döndür
      }
      
      return cleanedText;
    } catch (error: any) {
      this.logger.error("PDF metin çıkarma hatası:", error);
      
      // Daha anlamlı hata mesajı
      if (error.message?.includes("Invalid PDF")) {
        throw new Error("Dosya geçerli bir PDF formatında değil. UDF dosyaları şifreli olabilir - lütfen UYAP'tan PDF olarak indirin.");
      }
      throw error;
    }
  }

  /**
   * Görüntüyü OCR için optimize et (Sharp ile ön işleme)
   */
  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      this.logger.log("Görüntü ön işleme başlatılıyor...");
      
      // Görüntü metadata'sını al
      const metadata = await sharp(buffer).metadata();
      this.logger.log(`Orijinal boyut: ${metadata.width}x${metadata.height}`);
      
      let processedBuffer = await sharp(buffer)
        // 1. Gri tonlamaya çevir (OCR için daha iyi)
        .grayscale()
        // 2. Kontrastı artır
        .normalize()
        // 3. Keskinleştir
        .sharpen({ sigma: 1.5 })
        // 4. Minimum 2000px genişlik (OCR için ideal)
        .resize({
          width: Math.max(metadata.width || 1000, 2000),
          height: Math.max(metadata.height || 1000, 2000),
          fit: "inside",
          withoutEnlargement: false,
        })
        // 5. Threshold uygula (siyah-beyaz, metin için ideal)
        .threshold(128)
        // 6. PNG olarak kaydet (kayıpsız)
        .png({ quality: 100 })
        .toBuffer();
      
      const newMetadata = await sharp(processedBuffer).metadata();
      this.logger.log(`İşlenmiş boyut: ${newMetadata.width}x${newMetadata.height}`);
      
      return processedBuffer;
    } catch (error) {
      this.logger.warn("Görüntü ön işleme başarısız, orijinal kullanılacak:", error);
      return buffer;
    }
  }

  /**
   * Görüntüden metin çıkar (OCR) - Sharp ön işleme + Tesseract.js
   */
  async extractTextFromImage(buffer: Buffer): Promise<string> {
    try {
      this.logger.log("OCR işlemi başlatılıyor...");
      
      // 1. Görüntüyü ön işle (kalite artırma)
      const processedBuffer = await this.preprocessImage(buffer);
      
      // 2. Buffer'ı base64'e çevir
      const base64Image = `data:image/png;base64,${processedBuffer.toString("base64")}`;
      
      // 3. Tesseract ile OCR yap - Türkçe + İngilizce dil desteği
      this.logger.log("Tesseract OCR başlatılıyor (tur+eng)...");
      const result = await Tesseract.recognize(base64Image, "tur+eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            this.logger.debug(`OCR ilerleme: %${Math.round(m.progress * 100)}`);
          }
        },
      });
      
      const extractedText = result.data.text;
      this.logger.log(`OCR tamamlandı. ${extractedText.length} karakter çıkarıldı.`);
      
      // 4. Metin temizleme
      const cleanedText = this.cleanOcrText(extractedText);
      
      // Debug: Çıkarılan metni logla
      this.logger.debug(`Çıkarılan metin (ilk 500 karakter): ${cleanedText.substring(0, 500)}`);
      
      return cleanedText;
    } catch (error) {
      this.logger.error("OCR hatası:", error);
      throw error;
    }
  }

  /**
   * OCR metnini temizle
   */
  private cleanOcrText(text: string): string {
    return text
      // Fazla boşlukları temizle
      .replace(/\s+/g, " ")
      // Satır sonlarını normalize et
      .replace(/\r\n/g, "\n")
      // Çoklu satır sonlarını tek satıra indir
      .replace(/\n{3,}/g, "\n\n")
      // Başındaki ve sonundaki boşlukları temizle
      .trim();
  }

  /**
   * Metnin geçerli Türkçe/İngilizce metin olup olmadığını kontrol et
   * Bozuk encoding (Çince karakterler vb.) tespiti
   */
  private isValidText(text: string): boolean {
    if (!text || text.length < 50) return false;
    
    // Türkçe ve İngilizce karakterler (Latin alfabesi + Türkçe özel karakterler)
    const validCharsRegex = /[a-zA-ZğüşıöçĞÜŞİÖÇ0-9\s.,;:!?'"()\-\/\\@#$%&*+=<>[\]{}|~`^_]/g;
    const validChars = text.match(validCharsRegex) || [];
    
    // Geçerli karakter oranı
    const validRatio = validChars.length / text.length;
    
    this.logger.debug(`Metin geçerlilik oranı: ${(validRatio * 100).toFixed(1)}%`);
    
    // En az %60 geçerli karakter olmalı
    return validRatio >= 0.6;
  }

  /**
   * Word (.docx) dosyasından metin çıkar
   * DOCX = ZIP içinde word/document.xml
   */
  async extractTextFromDocx(buffer: Buffer): Promise<string> {
    try {
      this.logger.log("Word (DOCX) dosyası açılıyor...");
      
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      
      this.logger.log(`DOCX içinde ${zipEntries.length} dosya bulundu`);
      
      let contentText = "";
      
      for (const entry of zipEntries) {
        // Ana içerik word/document.xml içinde
        if (entry.entryName === "word/document.xml") {
          const documentXml = entry.getData().toString("utf-8");
          
          // <w:t> tag'leri içindeki metinleri çıkar
          const textMatches = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
          if (textMatches) {
            const texts = textMatches.map(match => {
              const textMatch = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
              return textMatch ? textMatch[1] : "";
            });
            contentText = texts.join(" ");
          }
          
          this.logger.log(`document.xml'den ${contentText.length} karakter çıkarıldı`);
          break;
        }
      }
      
      if (!contentText) {
        // Alternatif: tüm XML içeriğinden metin çıkar
        for (const entry of zipEntries) {
          if (entry.entryName.endsWith(".xml") && entry.entryName.includes("word")) {
            const xml = entry.getData().toString("utf-8");
            // Tüm tag'leri kaldır
            const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (text.length > contentText.length) {
              contentText = text;
            }
          }
        }
      }
      
      if (!contentText) {
        throw new Error("Word dosyasında içerik bulunamadı");
      }
      
      // Metin temizleme
      const cleanedText = this.cleanOcrText(contentText);
      
      this.logger.log(`Word dosyası başarıyla okundu. Metin: ${cleanedText.length} karakter`);
      
      return cleanedText;
    } catch (error: any) {
      this.logger.error("Word okuma hatası:", error);
      throw new Error(`Word dosyası okunamadı: ${error.message}`);
    }
  }

  /**
   * Eski Word (.doc) dosyasından metin çıkar - mammoth kullanarak
   */
  async extractTextFromDoc(buffer: Buffer): Promise<string> {
    try {
      this.logger.log("Eski Word (.doc) dosyası okunuyor (mammoth)...");
      
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = result.value;
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("Word dosyasında içerik bulunamadı");
      }
      
      // Metin temizleme
      const cleanedText = this.cleanOcrText(extractedText);
      
      this.logger.log(`Eski Word dosyası başarıyla okundu. Metin: ${cleanedText.length} karakter`);
      
      // Uyarıları logla
      if (result.messages && result.messages.length > 0) {
        result.messages.forEach(msg => {
          this.logger.debug(`Mammoth uyarı: ${msg.message}`);
        });
      }
      
      return cleanedText;
    } catch (error: any) {
      this.logger.error("Eski Word okuma hatası:", error);
      // Daha kullanıcı dostu hata mesajı
      if (error.message?.includes("Could not find") || error.message?.includes("docx")) {
        throw new Error("Bu dosya çok eski bir Word formatında veya bozuk olabilir. Lütfen dosyayı Word'de açıp .docx olarak kaydedin.");
      }
      throw new Error(`Eski Word dosyası okunamadı: ${error.message}`);
    }
  }

  /**
   * Dosya tipine göre metin çıkar
   */
  async extractText(
    buffer: Buffer,
    mimeType: string,
    filename?: string
  ): Promise<{ text: string; method: string; metadata?: Record<string, string> }> {
    const lowerFilename = filename?.toLowerCase() || "";
    const isUdf = lowerFilename.endsWith(".udf");
    const isDocx = lowerFilename.endsWith(".docx") || 
                   mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isDoc = lowerFilename.endsWith(".doc") || 
                  mimeType === "application/msword";
    
    // UDF dosyaları - UYAP formatı (ZIP içinde XML)
    if (isUdf) {
      const { text, metadata } = await this.extractTextFromUdf(buffer);
      return { text, method: "udf-parse", metadata };
    }
    
    // Word DOCX dosyaları (Office 2007+)
    if (isDocx) {
      const text = await this.extractTextFromDocx(buffer);
      return { text, method: "docx-parse" };
    }
    
    // Eski Word DOC dosyaları - mammoth ile oku
    if (isDoc) {
      const text = await this.extractTextFromDoc(buffer);
      return { text, method: "doc-parse" };
    }
    
    // PDF dosyaları
    if (mimeType === "application/pdf" || lowerFilename.endsWith(".pdf")) {
      const text = await this.extractTextFromPdf(buffer);
      
      // Eğer metin null ise (bozuk encoding), PDF'i görüntüye çevirip OCR dene
      if (text === null) {
        this.logger.log("PDF metni bozuk, OCR ile yeniden deneniyor...");
        try {
          // PDF'in ilk sayfasını görüntüye çevir ve OCR yap
          const ocrText = await this.extractTextFromPdfWithOcr(buffer);
          if (ocrText && ocrText.length > 50) {
            return { text: ocrText, method: "pdf-ocr" };
          }
        } catch (ocrError) {
          this.logger.warn("PDF OCR başarısız:", ocrError);
        }
        // OCR da başarısız olduysa, dosya adından ipucu al
        return { text: "", method: "pdf-parse-failed" };
      }
      
      return { text, method: "pdf-parse" };
    }
    
    // RTF dosyaları - basit metin çıkarma
    if (lowerFilename.endsWith(".rtf") || mimeType === "application/rtf" || mimeType === "text/rtf") {
      const text = this.extractTextFromRtf(buffer);
      return { text, method: "rtf-parse" };
    }
    
    // Görüntü dosyaları - OCR (TIFF dahil)
    const isImage = mimeType.startsWith("image/") || 
                    lowerFilename.endsWith(".tiff") || 
                    lowerFilename.endsWith(".tif") ||
                    lowerFilename.endsWith(".bmp");
    if (isImage) {
      const text = await this.extractTextFromImage(buffer);
      return { text, method: "ocr" };
    }
    
    // Düz metin
    if (mimeType === "text/plain" || lowerFilename.endsWith(".txt")) {
      return { text: buffer.toString("utf-8"), method: "plain-text" };
    }

    return { text: "", method: "unsupported" };
  }

  /**
   * RTF dosyasından metin çıkar (basit yöntem)
   */
  private extractTextFromRtf(buffer: Buffer): string {
    try {
      this.logger.log("RTF dosyası okunuyor...");
      
      let rtfContent = buffer.toString("utf-8");
      
      // RTF kontrol karakterlerini temizle
      // 1. Header'ı kaldır
      rtfContent = rtfContent.replace(/^\{\\rtf1[^}]*\}/g, "");
      
      // 2. Kontrol kelimelerini kaldır (\par, \pard, \b, \i vb.)
      rtfContent = rtfContent.replace(/\\[a-z]+\d*\s?/gi, " ");
      
      // 3. Özel karakterleri dönüştür
      rtfContent = rtfContent.replace(/\\'([0-9a-f]{2})/gi, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
      
      // 4. Süslü parantezleri kaldır
      rtfContent = rtfContent.replace(/[{}]/g, "");
      
      // 5. Fazla boşlukları temizle
      rtfContent = rtfContent.replace(/\s+/g, " ").trim();
      
      this.logger.log(`RTF'den ${rtfContent.length} karakter çıkarıldı`);
      
      return rtfContent;
    } catch (error: any) {
      this.logger.error("RTF okuma hatası:", error);
      throw new Error(`RTF dosyası okunamadı: ${error.message}`);
    }
  }

  /**
   * PDF'den OCR ile metin çıkar (bozuk encoding durumunda)
   * Not: Bu basit bir implementasyon - gerçek PDF-to-image için pdf-poppler gerekir
   */
  private async extractTextFromPdfWithOcr(buffer: Buffer): Promise<string> {
    // PDF'i doğrudan OCR'a göndermeyi dene (bazı OCR kütüphaneleri PDF destekler)
    // Şimdilik bu özellik için placeholder - ileride pdf-poppler ile geliştirilebilir
    this.logger.warn("PDF OCR özelliği henüz tam desteklenmiyor. Dosya adından ipucu alınacak.");
    return "";
  }

  /**
   * Vekaletname belgesi tarama - OpenAI ile
   */
  async scanPowerOfAttorney(buffer: Buffer, mimeType: string, filename?: string): Promise<PowerOfAttorneyResult> {
    // Görüntü dosyası mı kontrol et
    const isImage = mimeType.startsWith("image/") || 
                    filename?.toLowerCase().endsWith(".jpg") ||
                    filename?.toLowerCase().endsWith(".jpeg") ||
                    filename?.toLowerCase().endsWith(".png") ||
                    filename?.toLowerCase().endsWith(".tiff") ||
                    filename?.toLowerCase().endsWith(".tif");

    // 1. Belgeden metin çıkar
    const { text } = await this.extractText(buffer, mimeType, filename);
    
    // Görüntü dosyası veya metin çıkarılamadıysa Vision API kullan
    if (isImage || !text || text.length < 50) {
      this.logger.log("Metin çıkarılamadı veya görüntü dosyası, Vision API deneniyor...");
      return this.scanPoaWithVision(buffer, mimeType);
    }

    this.logger.log(`Vekaletname tarama başlatılıyor. Metin uzunluğu: ${text.length}`);

    // 2. OpenAI ile analiz et
    if (!this.openai) {
      this.logger.warn("OpenAI yapılandırılmamış, kural tabanlı analiz yapılacak");
      return this.parsePoaWithRules(text);
    }

    const model = this.configService.get<string>("OPENAI_MODEL") || "gpt-4";

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Sen bir Türk hukuku uzmanısın. Verilen vekaletname metnini analiz ederek müvekkil ve vekalet bilgilerini çıkar.

Vekaletnamelerde şu bilgiler bulunur:
- Müvekkil (vekalet veren): Ad Soyad veya Şirket Adı, TC Kimlik No veya Vergi No
- Vekil (avukat): Ad Soyad, Baro Sicil No
- Noter bilgileri: Noter adı, yevmiye no, tarih
- Yetkiler: Ahzu kabza (para alma), feragat, sulh, ibra, dava açma vb.

Yetki tespiti için şu ifadeleri ara:
- "ahzu kabza" veya "para alma" = canCollect: true
- "feragat" = canWaive: true  
- "sulh" veya "uzlaşma" = canSettle: true
- "ibra" = canRelease: true

JSON formatında yanıt ver:
{
  "clientType": "PERSON|COMPANY|PUBLIC",
  "firstName": "Ad (şahıs ise)",
  "lastName": "Soyad (şahıs ise)",
  "companyName": "Şirket adı (kurum ise)",
  "tckn": "TC Kimlik No (11 hane, şahıs ise)",
  "vkn": "Vergi No (10 hane, kurum ise)",
  "taxOffice": "Vergi dairesi",
  "phone": "Telefon",
  "address": "Adres",
  "city": "İl",
  "district": "İlçe",
  "poaNumber": "Vekaletname/Yevmiye numarası",
  "poaDate": "Vekaletname tarihi (YYYY-MM-DD)",
  "notaryName": "Noter adı",
  "notaryCity": "Noter ili",
  "canCollect": true/false,
  "canWaive": true/false,
  "canSettle": true/false,
  "canRelease": true/false,
  "lawyerName": "Avukat adı soyadı",
  "lawyerBarNumber": "Baro sicil no",
  "lawyerBarCity": "Kayıtlı baro",
  "confidence": 0-100
}`
          },
          {
            role: "user",
            content: `Aşağıdaki vekaletname metnini analiz et ve bilgileri çıkar:\n\n${text.substring(0, 4000)}`
          }
        ],
        temperature: 0.1,
        ...(model.startsWith("o1") ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`OpenAI vekaletname yanıtı: ${content}`);

      const parsed = JSON.parse(content);

      return {
        clientType: parsed.clientType || "PERSON",
        firstName: parsed.firstName || undefined,
        lastName: parsed.lastName || undefined,
        companyName: parsed.companyName || undefined,
        tckn: parsed.tckn || undefined,
        vkn: parsed.vkn || undefined,
        taxOffice: parsed.taxOffice || undefined,
        phone: parsed.phone || undefined,
        email: parsed.email || undefined,
        address: parsed.address || undefined,
        city: parsed.city || undefined,
        district: parsed.district || undefined,
        poaNumber: parsed.poaNumber || undefined,
        poaDate: parsed.poaDate || undefined,
        notaryName: parsed.notaryName || undefined,
        notaryCity: parsed.notaryCity || undefined,
        canCollect: parsed.canCollect ?? true,
        canWaive: parsed.canWaive ?? false,
        canSettle: parsed.canSettle ?? false,
        canRelease: parsed.canRelease ?? false,
        lawyerName: parsed.lawyerName || undefined,
        lawyerBarNumber: parsed.lawyerBarNumber || undefined,
        lawyerBarCity: parsed.lawyerBarCity || undefined,
        confidence: parsed.confidence || 70,
        rawText: text.substring(0, 1000),
      };
    } catch (error) {
      this.logger.error("OpenAI vekaletname analiz hatası:", error);
      return this.parsePoaWithRules(text);
    }
  }

  /**
   * Kural tabanlı vekaletname analizi (OpenAI yoksa fallback)
   */
  private parsePoaWithRules(text: string): PowerOfAttorneyResult {
    const lowerText = text.toLowerCase();
    
    // TC Kimlik No bul (11 haneli sayı)
    const tcknMatch = text.match(/\b(\d{11})\b/);
    const tckn = tcknMatch ? tcknMatch[1] : undefined;

    // VKN bul (10 haneli sayı)
    const vknMatch = text.match(/vergi\s*(?:no|numarası|kimlik)\s*[:\s]*(\d{10})/i);
    const vkn = vknMatch ? vknMatch[1] : undefined;

    // Şirket adı bul
    const companyPatterns = [
      /([A-ZĞÜŞİÖÇ][A-ZĞÜŞİÖÇa-zğüşıöç\s]+(?:A\.?Ş\.?|LTD\.?\s*ŞTİ\.?|ANONİM\s*ŞİRKETİ|LİMİTED\s*ŞİRKETİ))/i,
    ];
    let companyName: string | undefined;
    for (const pattern of companyPatterns) {
      const match = text.match(pattern);
      if (match) {
        companyName = match[1].trim();
        break;
      }
    }

    // Yetkileri tespit et
    const canCollect = lowerText.includes("ahzu kabza") || lowerText.includes("para alma") || lowerText.includes("tahsil");
    const canWaive = lowerText.includes("feragat");
    const canSettle = lowerText.includes("sulh") || lowerText.includes("uzlaşma");
    const canRelease = lowerText.includes("ibra");

    // Noter bilgileri
    const notaryMatch = text.match(/(\d+)\.\s*noter/i);
    const notaryName = notaryMatch ? `${notaryMatch[1]}. Noter` : undefined;

    // Yevmiye no
    const yevmiyeMatch = text.match(/yevmiye\s*(?:no|numarası)?\s*[:\s]*(\d+)/i);
    const poaNumber = yevmiyeMatch ? yevmiyeMatch[1] : undefined;

    // Tarih bul
    const dateMatch = text.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})/);
    const poaDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : undefined;

    // Avukat adı
    const lawyerMatch = text.match(/(?:av\.|avukat)\s*([A-ZĞÜŞİÖÇ][a-zğüşıöç]+\s+[A-ZĞÜŞİÖÇ][a-zğüşıöç]+)/i);
    const lawyerName = lawyerMatch ? lawyerMatch[1] : undefined;

    // Baro sicil no
    const barMatch = text.match(/(?:baro\s*(?:sicil)?\s*(?:no|numarası)?)\s*[:\s]*(\d+)/i);
    const lawyerBarNumber = barMatch ? barMatch[1] : undefined;

    const clientType = companyName || vkn ? "COMPANY" : "PERSON";

    return {
      clientType,
      companyName,
      tckn: clientType === "PERSON" ? tckn : undefined,
      vkn: clientType === "COMPANY" ? (vkn || tckn) : undefined,
      canCollect,
      canWaive,
      canSettle,
      canRelease,
      poaNumber,
      poaDate,
      notaryName,
      lawyerName,
      lawyerBarNumber,
      confidence: 40,
      rawText: text.substring(0, 1000),
    };
  }

  /**
   * OpenAI Vision API ile vekaletname tarama (görüntü dosyaları için)
   */
  private async scanPoaWithVision(buffer: Buffer, mimeType: string): Promise<PowerOfAttorneyResult> {
    if (!this.openai) {
      throw new Error("OpenAI yapılandırılmamış. Görüntü dosyaları için OpenAI API anahtarı gereklidir.");
    }

    let imageBuffer = buffer;
    let imageMediaType = "image/jpeg";

    // PDF ise görüntüye çevir
    if (mimeType === "application/pdf") {
      this.logger.log("PDF görüntüye çevriliyor...");
      try {
        imageBuffer = await this.convertPdfToImage(buffer);
        imageMediaType = "image/jpeg";
      } catch (error: any) {
        this.logger.error("PDF görüntüye çevrilemedi:", error);
        throw new Error("PDF dosyası işlenemedi. Lütfen vekaletname görüntüsünü (JPG, PNG) yükleyin.");
      }
    } else {
      imageMediaType = mimeType.includes("png") ? "image/png" : 
                       mimeType.includes("gif") ? "image/gif" : 
                       mimeType.includes("webp") ? "image/webp" : "image/jpeg";
    }

    this.logger.log("Vision API ile vekaletname taranıyor...");

    // Görüntüyü base64'e çevir
    const base64Image = imageBuffer.toString("base64");

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Bu bir Türk vekaletname belgesidir. Lütfen belgedeki bilgileri analiz et ve aşağıdaki JSON formatında döndür:

{
  "clientType": "PERSON veya COMPANY veya PUBLIC",
  "firstName": "Müvekkilin adı (şahıs ise)",
  "lastName": "Müvekkilin soyadı (şahıs ise)",
  "companyName": "Şirket adı (kurum ise)",
  "tckn": "TC Kimlik No (11 hane)",
  "vkn": "Vergi No (10 hane, kurum ise)",
  "taxOffice": "Vergi dairesi",
  "address": "Adres",
  "city": "İl",
  "district": "İlçe",
  "poaNumber": "Yevmiye numarası",
  "poaDate": "Tarih (YYYY-MM-DD formatında)",
  "notaryName": "Noter adı",
  "notaryCity": "Noter ili",
  "canCollect": true/false (ahzu kabza yetkisi var mı),
  "canWaive": true/false (feragat yetkisi var mı),
  "canSettle": true/false (sulh yetkisi var mı),
  "canRelease": true/false (ibra yetkisi var mı),
  "lawyerName": "Avukat adı soyadı",
  "lawyerBarNumber": "Baro sicil no",
  "lawyerBarCity": "Kayıtlı baro",
  "confidence": 0-100 (ne kadar emin olduğun)
}

Sadece JSON döndür, başka açıklama ekleme.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${imageMediaType};base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`Vision API yanıtı: ${content}`);

      // JSON'u parse et (bazen markdown code block içinde gelebilir)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      return {
        clientType: parsed.clientType || "PERSON",
        firstName: parsed.firstName || undefined,
        lastName: parsed.lastName || undefined,
        companyName: parsed.companyName || undefined,
        tckn: parsed.tckn || undefined,
        vkn: parsed.vkn || undefined,
        taxOffice: parsed.taxOffice || undefined,
        phone: parsed.phone || undefined,
        email: parsed.email || undefined,
        address: parsed.address || undefined,
        city: parsed.city || undefined,
        district: parsed.district || undefined,
        poaNumber: parsed.poaNumber || undefined,
        poaDate: parsed.poaDate || undefined,
        notaryName: parsed.notaryName || undefined,
        notaryCity: parsed.notaryCity || undefined,
        canCollect: parsed.canCollect ?? true,
        canWaive: parsed.canWaive ?? false,
        canSettle: parsed.canSettle ?? false,
        canRelease: parsed.canRelease ?? false,
        lawyerName: parsed.lawyerName || undefined,
        lawyerBarNumber: parsed.lawyerBarNumber || undefined,
        lawyerBarCity: parsed.lawyerBarCity || undefined,
        confidence: parsed.confidence || 70,
      };
    } catch (error: any) {
      this.logger.error("Vision API hatası:", error);
      throw new Error(`Vekaletname görüntüsü analiz edilemedi: ${error.message}`);
    }
  }

  /**
   * PDF'i görüntüye çevir (ilk sayfa)
   */
  private async convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
    // Geçici dosya oluştur
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `poa_${Date.now()}.pdf`);
    const tempOutputPath = path.join(tempDir, `poa_${Date.now()}`);

    try {
      // PDF'i geçici dosyaya yaz
      fs.writeFileSync(tempPdfPath, pdfBuffer);

      // PDF'i görüntüye çevir
      const opts = {
        format: "jpeg",
        out_dir: tempDir,
        out_prefix: path.basename(tempOutputPath),
        page: 1,
        scale: 2048, // Yüksek çözünürlük
      };

      await pdfPoppler.convert(tempPdfPath, opts);

      // Oluşturulan görüntüyü oku
      const outputImagePath = `${tempOutputPath}-1.jpg`;
      
      if (!fs.existsSync(outputImagePath)) {
        throw new Error("PDF görüntüye çevrilemedi");
      }

      const imageBuffer = fs.readFileSync(outputImagePath);

      // Geçici dosyaları temizle
      try {
        fs.unlinkSync(tempPdfPath);
        fs.unlinkSync(outputImagePath);
      } catch {
        // Temizleme hatası önemli değil
      }

      this.logger.log(`PDF görüntüye çevrildi: ${imageBuffer.length} bytes`);
      return imageBuffer;
    } catch (error: any) {
      // Geçici dosyaları temizle
      try {
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
      } catch {
        // Temizleme hatası önemli değil
      }
      throw error;
    }
  }
}
