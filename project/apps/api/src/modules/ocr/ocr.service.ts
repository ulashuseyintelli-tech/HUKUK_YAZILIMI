import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Tesseract from "tesseract.js";
import * as sharp from "sharp";
import OpenAI from "openai";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

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
   * PDF'den metin çıkar (UDF dahil)
   */
  async extractTextFromPdf(buffer: Buffer): Promise<string> {
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
   * Dosya tipine göre metin çıkar
   */
  async extractText(
    buffer: Buffer,
    mimeType: string,
    filename?: string
  ): Promise<{ text: string; method: string }> {
    // UDF dosyaları PDF formatındadır
    const isUdf = filename?.toLowerCase().endsWith(".udf");
    
    if (mimeType === "application/pdf" || isUdf) {
      const text = await this.extractTextFromPdf(buffer);
      return { text, method: isUdf ? "udf-parse" : "pdf-parse" };
    } else if (mimeType.startsWith("image/")) {
      const text = await this.extractTextFromImage(buffer);
      return { text, method: "ocr" };
    } else if (mimeType === "text/plain") {
      return { text: buffer.toString("utf-8"), method: "plain-text" };
    }

    return { text: "", method: "unsupported" };
  }
}
