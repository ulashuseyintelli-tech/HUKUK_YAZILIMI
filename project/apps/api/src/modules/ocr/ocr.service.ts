import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Tesseract from "tesseract.js";
import * as sharp from "sharp";
import * as AdmZip from "adm-zip";
import * as mammoth from "mammoth";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";
import { ClaimEngineService } from "../claim-engine/claim-engine.service";
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
 * Borç evrakı tarama sonucu - Borçlu Sihirbazı için
 */
export interface DebtDocumentResult {
  // Evrak türü
  documentType: "FATURA" | "SENET" | "CEK" | "KIRA" | "CARI_HESAP" | "SOZLESME" | "DIGER";
  
  // Tespit edilen kişiler/kurumlar
  parties: {
    name: string;
    type: "INDIVIDUAL" | "COMPANY" | "PUBLIC_INSTITUTION";
    role: "BORCLU" | "ALACAKLI" | "KEFIL" | "CIRANTA" | "AVAL" | "MUTESELSIL";
    identityNo?: string; // TCKN veya VKN
    address?: string;
    city?: string;
    district?: string;
    phone?: string;
    confidence: number;
  }[];
  
  // Borç bilgileri
  debtInfo: {
    amount?: number;
    currency: "TRY" | "USD" | "EUR" | "GBP" | "CHF";
    dueDate?: string; // YYYY-MM-DD
    issueDate?: string; // Düzenleme tarihi
    documentNo?: string; // Fatura no, senet no, çek no vb.
    description?: string;
  };
  
  // Banka bilgileri (çek için)
  bankInfo?: {
    bankName?: string;
    branchName?: string;
    accountNo?: string;
    iban?: string;
  };
  
  // Önerilen takip türü
  suggestedCaseType: "ILAMLI" | "ILAMSIZ" | "KAMBIYO" | "KIRA";
  
  // Meta
  confidence: number;
  rawText?: string;
  matchedKeywords?: string[];
}

/**
 * Dış dosya (haciz yazısı) tarama sonucu - Alacak Haczi için
 */
export interface ExternalCaseDocumentResult {
  // Dış dosya bilgileri
  externalOffice?: string;      // İcra dairesi adı
  externalCaseNo?: string;      // Dosya numarası (2024/12345)
  
  // Karşı taraf bilgileri
  counterpartyName?: string;    // Borçlumuzun alacaklı olduğu kişi/kurum
  counterpartyIdentityNo?: string;
  
  // Alacak bilgileri
  claimAmount?: number;
  claimCurrency: "TRY" | "USD" | "EUR";
  
  // Haciz bilgileri
  attachmentDate?: string;      // Haciz tarihi
  attachmentType?: "BANKA" | "MAAS" | "TASINMAZ" | "ARAC" | "ALACAK" | "DIGER";
  
  // Belge türü
  documentType: "HACIZ_YAZISI" | "DOSYA_CIKTISI" | "IHBARNAME_CEVABI" | "DIGER";
  
  // Meta
  confidence: number;
  rawText?: string;
  matchedKeywords?: string[];
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
  // SÜRELİ VEKALET BİLGİLERİ (YENİ)
  isLimited?: boolean;           // Süreli vekalet mi?
  validUntil?: string;           // Geçerlilik bitiş tarihi (YYYY-MM-DD)
  scopeType?: "GENEL" | "ICRA_TAKIP" | "BU_DOSYA" | "OZEL";
  scopeDescription?: string;     // Kapsam açıklaması
  // Çoklu avukat desteği (YENİ)
  lawyers?: {
    name: string;
    barNumber?: string;
    barCity?: string;
  }[];
  // Meta
  confidence: number;
  rawText?: string;
}

/**
 * Süreli vekalet tespiti için keyword'ler
 */
const SURELI_VEKALET_KEYWORDS = [
  "tarihine kadar geçerlidir",
  "tarihine kadar gecerlidir",
  "süre ile sınırlı",
  "sure ile sinirli",
  "süreli vekalet",
  "sureli vekalet",
  "geçerlilik süresi",
  "gecerlilik suresi",
  "bitiş tarihi",
  "bitis tarihi",
  "son geçerlilik",
  "son gecerlilik",
  // "tarihine kadar" KALDIRILDI: vekaletnamelerde boilerplate olarak sık geçer (ör. kimlik kartı
  //   geçerlilik tarihi bağlamında) → false-positive "süreli vekalet". Yalnız "...tarihine kadar
  //   geçerlidir" (yukarıda) açık ibaresi süreli sayılır.
  "süresiz değildir",
  "suresiz degildir",
  "belirli süre",
  "belirli sure",
  "sınırlı süre",
  "sinirli sure",
];

/**
 * Süreli vekalet SAĞDUYU GUARD'ı (parser/AI çıkarımı sonrası).
 * Süreli SADECE açık VE düzenleme tarihinden SONRA bir bitiş tarihi varsa kabul edilir.
 * - validUntil yoksa → süresiz (uydurma süreli engellenir).
 * - validUntil <= poaDate ise → süresiz (düzenleme tarihi / müvekkilin kimlik-kartı geçerlilik
 *   tarihi yanlışlıkla validUntil olarak gelirse elenir). ISO YYYY-MM-DD karşılaştırması.
 */
export function sanitizeLimitedPoa(
  isLimited: boolean | undefined,
  validUntil: string | undefined,
  poaDate: string | undefined,
): { isLimited: boolean; validUntil: string | undefined } {
  const limited = !!isLimited && !!validUntil && (!poaDate || validUntil > poaDate);
  return { isLimited: limited, validUntil: limited ? validUntil : undefined };
}

/**
 * Vekalet kapsamı tespiti için keyword'ler
 */
const KAPSAM_KEYWORDS = {
  ICRA_TAKIP: [
    "icra takip",
    "icra işleri",
    "icra dairesi",
    "icra müdürlüğü",
    "icra takibi",
    "icra dosyası",
    "haciz",
    "tahsilat",
  ],
  BU_DOSYA: [
    "bu dosya",
    "işbu dava",
    "bu takip",
    "bu dava",
    "işbu dosya",
    "belirli dosya",
    "tek dosya",
  ],
  OZEL: [
    "özel vekalet",
    "ozel vekalet",
    "sınırlı yetki",
    "sinirli yetki",
    "belirli işlem",
    "belirli islem",
  ],
};

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
 * Kambiyo senedine ÖZGÜ güçlü çapa kelimeleri.
 *
 * KAMBIYO sınıflandırması yalnızca bunlardan en az biri metinde varsa seçilebilir.
 * "banka", "bankası", "tarih", "tl", "türk lirası", "karşılığı" gibi genel terimler
 * (KEYWORD_GROUPS.KAMBIYO içinde bulunsalar da) tek başına KAMBIYO'yu taşıyamaz —
 * aksi halde döviz/ilamlı mahkeme kararları yanlışlıkla KAMBIYO sınıflanıyordu
 * (ör. "Merkez Bankası efektif kur ... Türk Lirası karşılığı ... karar verilmiştir").
 */
const KAMBIYO_ANCHORS = [
  "çek",
  "cek",
  "bono",
  "senet",
  "poliçe",
  "police",
  "emre muharrer",
  "keşideci",
  "kesideci",
  "lehtar",
  "ciranta",
];

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

  constructor(
    private configService: ConfigService,
    @Optional() private claimEngineService?: ClaimEngineService,
  ) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey && apiKey !== "sk-your-openai-api-key-here") {
      this.openai = new OpenAI({ apiKey });
      this.logger.log("OpenAI client initialized for OCR classification");
    }
  }

  /**
   * Claim Engine ile belge sınıflandırma
   * YAML kurallarını kullanarak belge türünü tespit eder
   */
  classifyWithClaimEngine(textContent: string): {
    docType: string;
    confidence: number;
    matchedKeywords: string[];
    routing: {
      caseType: string;
      subCategory: string;
      form: string;
      routeType: string;
    } | null;
  } {
    if (!this.claimEngineService) {
      return {
        docType: 'OTHER',
        confidence: 0,
        matchedKeywords: [],
        routing: null,
      };
    }

    // Belge türünü sınıflandır
    const classification = this.claimEngineService.classifyDocument(textContent);
    
    // Takip türünü belirle
    const routing = this.claimEngineService.routeCase(
      classification.docType,
      textContent,
    );

    return {
      docType: classification.docType,
      confidence: classification.confidence,
      matchedKeywords: classification.matchedKeywords,
      routing,
    };
  }

  /**
   * Claim Engine ile alacak kalemleri şablonlarını getir
   */
  getClaimItemTemplates(subCategory: string) {
    if (!this.claimEngineService) {
      return [];
    }
    return this.claimEngineService.getClaimItemTemplates(subCategory);
  }

  /**
   * Claim Engine ile dosya doğrulama
   */
  validateWithClaimEngine(
    caseType: string,
    subCategory: string,
    claimItems: Array<{ type: string }>,
    extractedData: Record<string, any>,
    wizardData: Record<string, any> = {},
  ) {
    if (!this.claimEngineService) {
      return { isValid: true, errors: [], warnings: [] };
    }
    return this.claimEngineService.validateCase(
      caseType,
      subCategory,
      claimItems,
      extractedData,
      wizardData,
    );
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

    // KAMBIYO yalnızca kambiyoya özgü güçlü çapa (çek/bono/senet/poliçe/emre
    // muharrer/keşideci/lehtar/ciranta) varsa seçilebilir. Çapa yoksa, genel
    // terimlerle (banka/tarih/tl/türk lirası/karşılığı) öne geçen KAMBIYO skorunu
    // yok say ve KAMBIYO dışı en yüksek kategoriye düş (ilamlı/döviz sinyali korunur).
    if (maxCategory === "KAMBIYO" && !this.hasKambiyoAnchor(normalizedText)) {
      maxCategory = "UNKNOWN";
      maxScore = 0;
      for (const [category, score] of Object.entries(scores)) {
        if (category === "KAMBIYO") continue;
        if (score > maxScore) {
          maxScore = score;
          maxCategory = category;
        }
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
   * Metinde kambiyoya özgü güçlü çapa kelimesi (çek/bono/senet/poliçe/emre
   * muharrer/keşideci/lehtar/ciranta) var mı?
   *
   * Çağrıldığı yerler:
   * - OcrService.classifyDocument() → KAMBIYO sınıflandırma guard'ı (genel
   *   terimlerin tek başına KAMBIYO seçmesini engeller)
   */
  private hasKambiyoAnchor(normalizedText: string): boolean {
    return KAMBIYO_ANCHORS.some((anchor) => normalizedText.includes(anchor));
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
      
      const processedBuffer = await sharp(buffer)
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
- Vekil (avukat): Ad Soyad, Baro Sicil No (birden fazla avukat olabilir)
- Noter bilgileri: Noter adı, yevmiye no, tarih
- Yetkiler: Ahzu kabza (para alma), feragat, sulh, ibra, dava açma vb.
- SÜRELİ VEKALET: "...tarihine kadar geçerlidir", "süreli vekalet", "geçerlilik süresi" gibi ifadeler
- KAPSAM: Genel, İcra Takipleri, Bu Dosya İçin, Özel

Yetki tespiti için şu ifadeleri ara:
- "ahzu kabza" veya "para alma" = canCollect: true
- "feragat" = canWaive: true  
- "sulh" veya "uzlaşma" = canSettle: true
- "ibra" = canRelease: true

SÜRELİ VEKALET TESPİTİ:
- isLimited: true SADECE vekaletin KENDİSİ için açık "...tarihine kadar geçerlidir" ibaresi varsa.
- ÖNEMLİ: Müvekkilin KİMLİK KARTI geçerlilik/veriliş tarihini ya da noter/düzenleme tarihini SÜRE sanma;
  bunlar validUntil DEĞİLDİR. validUntil mutlaka düzenleme tarihinden (poaDate) SONRA olan açık bir bitiş tarihidir.
- Açık bir bitiş ibaresi yoksa isLimited: false ve validUntil: null.

KAPSAM TESPİTİ:
- "icra takip", "icra işleri" → scopeType: "ICRA_TAKIP"
- "bu dosya", "işbu dava" → scopeType: "BU_DOSYA"
- "özel vekalet", "sınırlı yetki" → scopeType: "OZEL"
- Genel ifadeler veya belirtilmemişse → scopeType: "GENEL"

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
  "isLimited": true/false,
  "validUntil": "Bitiş tarihi (YYYY-MM-DD) veya null",
  "scopeType": "GENEL|ICRA_TAKIP|BU_DOSYA|OZEL",
  "scopeDescription": "Kapsam açıklaması (varsa)",
  "lawyers": [{"name": "Avukat adı", "barNumber": "Sicil no", "barCity": "Baro"}],
  "confidence": 0-100
}`
          },
          {
            role: "user",
            content: `Aşağıdaki vekaletname metnini analiz et ve bilgileri çıkar:\n\n${text.substring(0, 4000)}`
          }
        ],
        temperature: 0.1,
        ...(model.startsWith("o1") ? { max_completion_tokens: 1500 } : { max_tokens: 1500 }),
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`OpenAI vekaletname yanıtı: ${content}`);

      const parsed = JSON.parse(content);

      // Çoklu avukat desteği - eski format ile uyumluluk
      let lawyers = parsed.lawyers;
      if (!lawyers && parsed.lawyerName) {
        lawyers = [{
          name: parsed.lawyerName,
          barNumber: parsed.lawyerBarNumber,
          barCity: parsed.lawyerBarCity,
        }];
      }

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
        // Süreli vekalet bilgileri (guard: düzenleme/kimlik-kartı tarihi validUntil olamaz)
        ...sanitizeLimitedPoa(parsed.isLimited ?? false, parsed.validUntil || undefined, parsed.poaDate || undefined),
        scopeType: parsed.scopeType || "GENEL",
        scopeDescription: parsed.scopeDescription || undefined,
        // Çoklu avukat
        lawyers: lawyers || undefined,
        lawyerName: parsed.lawyerName || lawyers?.[0]?.name || undefined,
        lawyerBarNumber: parsed.lawyerBarNumber || lawyers?.[0]?.barNumber || undefined,
        lawyerBarCity: parsed.lawyerBarCity || lawyers?.[0]?.barCity || undefined,
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

    // Tarih bul (tüm tarihleri bul)
    const dateRegex = /(\d{2})[\.\/](\d{2})[\.\/](\d{4})/g;
    const allDates: string[] = [];
    let dateMatch;
    while ((dateMatch = dateRegex.exec(text)) !== null) {
      allDates.push(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
    }
    const poaDate = allDates[0]; // İlk tarih genellikle düzenleme tarihi

    // SÜRELİ VEKALET TESPİTİ
    let isLimited = false;
    let validUntil: string | undefined;
    
    // Süreli vekalet keyword'lerini kontrol et
    for (const keyword of SURELI_VEKALET_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        isLimited = true;
        break;
      }
    }
    
    // "...tarihine kadar" ifadesinden sonraki tarihi bul
    const validUntilMatch = text.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})\s*tarihine\s*kadar/i);
    if (validUntilMatch) {
      isLimited = true;
      validUntil = `${validUntilMatch[3]}-${validUntilMatch[2]}-${validUntilMatch[1]}`;
    }
    // NOT: "süreli ama tarih yok → belgedeki SON tarihi validUntil yap" fallback'i KALDIRILDI —
    //   son tarih genelde düzenleme/noter tarihi olup yanlışlıkla "bitiş tarihi" sanılıyordu.
    //   validUntil yalnız açık "...tarihine kadar" ibaresinden gelir; gerisini guard eler.

    // KAPSAM TESPİTİ
    let scopeType: "GENEL" | "ICRA_TAKIP" | "BU_DOSYA" | "OZEL" = "GENEL";
    let scopeDescription: string | undefined;
    
    for (const keyword of KAPSAM_KEYWORDS.ICRA_TAKIP) {
      if (lowerText.includes(keyword)) {
        scopeType = "ICRA_TAKIP";
        scopeDescription = "İcra takip işlemleri için";
        break;
      }
    }
    if (scopeType === "GENEL") {
      for (const keyword of KAPSAM_KEYWORDS.BU_DOSYA) {
        if (lowerText.includes(keyword)) {
          scopeType = "BU_DOSYA";
          scopeDescription = "Belirli dosya için";
          break;
        }
      }
    }
    if (scopeType === "GENEL") {
      for (const keyword of KAPSAM_KEYWORDS.OZEL) {
        if (lowerText.includes(keyword)) {
          scopeType = "OZEL";
          scopeDescription = "Özel kapsam";
          break;
        }
      }
    }

    // Avukat adı (birden fazla olabilir)
    const lawyerRegex = /(?:av\.|avukat)\s*([A-ZĞÜŞİÖÇ][a-zğüşıöç]+\s+[A-ZĞÜŞİÖÇ][a-zğüşıöç]+)/gi;
    const lawyers: { name: string; barNumber?: string; barCity?: string }[] = [];
    let lawyerMatch;
    while ((lawyerMatch = lawyerRegex.exec(text)) !== null) {
      lawyers.push({ name: lawyerMatch[1] });
    }

    // Baro sicil no
    const barMatch = text.match(/(?:baro\s*(?:sicil)?\s*(?:no|numarası)?)\s*[:\s]*(\d+)/i);
    const lawyerBarNumber = barMatch ? barMatch[1] : undefined;
    
    // İlk avukata baro sicil no ekle
    if (lawyers.length > 0 && lawyerBarNumber) {
      lawyers[0].barNumber = lawyerBarNumber;
    }

    const clientType = companyName || vkn ? "COMPANY" : "PERSON";
    const lim = sanitizeLimitedPoa(isLimited, validUntil, poaDate);

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
      // Süreli vekalet (sağduyu guard'ı uygulanmış)
      isLimited: lim.isLimited,
      validUntil: lim.validUntil,
      scopeType,
      scopeDescription,
      // Avukatlar
      lawyers: lawyers.length > 0 ? lawyers : undefined,
      lawyerName: lawyers[0]?.name,
      lawyerBarNumber: lawyers[0]?.barNumber,
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
  "isLimited": true/false (süreli vekalet mi - "tarihine kadar geçerlidir" ifadesi var mı),
  "validUntil": "Geçerlilik bitiş tarihi (YYYY-MM-DD) veya null",
  "scopeType": "GENEL|ICRA_TAKIP|BU_DOSYA|OZEL",
  "scopeDescription": "Kapsam açıklaması",
  "lawyers": [{"name": "Avukat adı", "barNumber": "Sicil no", "barCity": "Baro"}],
  "confidence": 0-100 (ne kadar emin olduğun)
}

SÜRELİ VEKALET: isLimited: true SADECE vekaletin kendisi için açık "...tarihine kadar geçerlidir" ibaresi varsa. Müvekkilin KİMLİK KARTI geçerlilik tarihini veya noter/düzenleme tarihini validUntil/süre SANMA; açık bir bitiş ibaresi yoksa isLimited: false ve validUntil: null.
KAPSAM: İcra takip işlemleri için ise ICRA_TAKIP, belirli dosya için ise BU_DOSYA, özel kapsam ise OZEL, genel ise GENEL.

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

      // Çoklu avukat desteği
      let lawyers = parsed.lawyers;
      if (!lawyers && parsed.lawyerName) {
        lawyers = [{
          name: parsed.lawyerName,
          barNumber: parsed.lawyerBarNumber,
          barCity: parsed.lawyerBarCity,
        }];
      }

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
        // Süreli vekalet (guard: düzenleme/kimlik-kartı tarihi validUntil olamaz)
        ...sanitizeLimitedPoa(parsed.isLimited ?? false, parsed.validUntil || undefined, parsed.poaDate || undefined),
        scopeType: parsed.scopeType || "GENEL",
        scopeDescription: parsed.scopeDescription || undefined,
        // Çoklu avukat
        lawyers: lawyers || undefined,
        lawyerName: parsed.lawyerName || lawyers?.[0]?.name || undefined,
        lawyerBarNumber: parsed.lawyerBarNumber || lawyers?.[0]?.barNumber || undefined,
        lawyerBarCity: parsed.lawyerBarCity || lawyers?.[0]?.barCity || undefined,
        confidence: parsed.confidence || 70,
      };
    } catch (error: any) {
      this.logger.error("Vision API hatası:", error);
      throw new Error(`Vekaletname görüntüsü analiz edilemedi: ${error.message}`);
    }
  }

  /**
   * Borç evrakı tarama - Borçlu Sihirbazı için
   * Fatura, senet, çek, kira sözleşmesi, cari hesap ekstresi vb.
   */
  async scanDebtDocument(buffer: Buffer, mimeType: string, filename?: string): Promise<DebtDocumentResult> {
    // 1. Belgeden metin çıkar
    const { text } = await this.extractText(buffer, mimeType, filename);
    
    // Görüntü dosyası veya metin çıkarılamadıysa Vision API kullan
    const isImage = mimeType.startsWith("image/") || 
                    filename?.toLowerCase().endsWith(".jpg") ||
                    filename?.toLowerCase().endsWith(".jpeg") ||
                    filename?.toLowerCase().endsWith(".png") ||
                    filename?.toLowerCase().endsWith(".tiff");
    
    if (isImage || !text || text.length < 50) {
      this.logger.log("Metin çıkarılamadı veya görüntü dosyası, Vision API deneniyor...");
      return this.scanDebtDocumentWithVision(buffer, mimeType);
    }

    this.logger.log(`Borç evrakı tarama başlatılıyor. Metin uzunluğu: ${text.length}`);

    // 2. OpenAI ile analiz et
    if (!this.openai) {
      this.logger.warn("OpenAI yapılandırılmamış, kural tabanlı analiz yapılacak");
      return this.parseDebtDocumentWithRules(text);
    }

    const model = this.configService.get<string>("OPENAI_MODEL") || "gpt-4";

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Sen bir Türk icra hukuku uzmanısın. Verilen borç evrakını analiz ederek borçlu bilgilerini, vade ve tutarı çıkar.

Evrak türleri:
- FATURA: Ticari fatura, e-fatura
- SENET: Bono, emre muharrer senet
- CEK: Çek
- KIRA: Kira sözleşmesi
- CARI_HESAP: Cari hesap ekstresi
- SOZLESME: Diğer sözleşmeler
- DIGER: Belirsiz

Rol tespiti:
- BORCLU: Borçlu, müşteri, alıcı, kiracı, keşideci (çekte)
- ALACAKLI: Alacaklı, satıcı, kiraya veren, lehtar
- KEFIL: Kefil, müşterek borçlu
- CIRANTA: Ciranta (çek/senette)
- AVAL: Aval veren
- MUTESELSIL: Müteselsil borçlu

JSON formatında yanıt ver:
{
  "documentType": "FATURA|SENET|CEK|KIRA|CARI_HESAP|SOZLESME|DIGER",
  "parties": [
    {
      "name": "Ad Soyad veya Şirket Adı",
      "type": "INDIVIDUAL|COMPANY|PUBLIC_INSTITUTION",
      "role": "BORCLU|ALACAKLI|KEFIL|CIRANTA|AVAL|MUTESELSIL",
      "identityNo": "TCKN (11 hane) veya VKN (10 hane)",
      "address": "Adres",
      "city": "İl",
      "district": "İlçe",
      "phone": "Telefon",
      "confidence": 0-100
    }
  ],
  "debtInfo": {
    "amount": 12345.67,
    "currency": "TRY|USD|EUR|GBP|CHF",
    "dueDate": "YYYY-MM-DD",
    "issueDate": "YYYY-MM-DD",
    "documentNo": "Belge numarası",
    "description": "Açıklama"
  },
  "bankInfo": {
    "bankName": "Banka adı (çek için)",
    "branchName": "Şube",
    "accountNo": "Hesap no",
    "iban": "IBAN"
  },
  "suggestedCaseType": "ILAMLI|ILAMSIZ|KAMBIYO|KIRA",
  "confidence": 0-100,
  "matchedKeywords": ["kelime1", "kelime2"]
}`
          },
          {
            role: "user",
            content: `Aşağıdaki borç evrakını analiz et ve bilgileri çıkar:\n\n${text.substring(0, 4000)}`
          }
        ],
        temperature: 0.1,
        ...(model.startsWith("o1") ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`OpenAI borç evrakı yanıtı: ${content}`);

      const parsed = JSON.parse(content);

      return {
        documentType: parsed.documentType || "DIGER",
        parties: (parsed.parties || []).map((p: any) => ({
          name: p.name || "",
          type: p.type || "INDIVIDUAL",
          role: p.role || "BORCLU",
          identityNo: p.identityNo,
          address: p.address,
          city: p.city,
          district: p.district,
          phone: p.phone,
          confidence: p.confidence || 70,
        })),
        debtInfo: {
          amount: parsed.debtInfo?.amount,
          currency: parsed.debtInfo?.currency || "TRY",
          dueDate: parsed.debtInfo?.dueDate,
          issueDate: parsed.debtInfo?.issueDate,
          documentNo: parsed.debtInfo?.documentNo,
          description: parsed.debtInfo?.description,
        },
        bankInfo: parsed.bankInfo,
        suggestedCaseType: parsed.suggestedCaseType || "ILAMSIZ",
        confidence: parsed.confidence || 70,
        rawText: text.substring(0, 1000),
        matchedKeywords: parsed.matchedKeywords || [],
      };
    } catch (error) {
      this.logger.error("OpenAI borç evrakı analiz hatası:", error);
      return this.parseDebtDocumentWithRules(text);
    }
  }

  /**
   * Kural tabanlı borç evrakı analizi (OpenAI yoksa fallback)
   */
  private parseDebtDocumentWithRules(text: string): DebtDocumentResult {
    const lowerText = text.toLowerCase();
    const parties: DebtDocumentResult["parties"] = [];
    
    // Evrak türü tespit et
    let documentType: DebtDocumentResult["documentType"] = "DIGER";
    let suggestedCaseType: DebtDocumentResult["suggestedCaseType"] = "ILAMSIZ";
    const matchedKeywords: string[] = [];
    
    // Çek tespiti
    if (lowerText.includes("bu çek") || lowerText.includes("çek karşılığında") || 
        lowerText.includes("keşideci") || lowerText.includes("hamiline")) {
      documentType = "CEK";
      suggestedCaseType = "KAMBIYO";
      matchedKeywords.push("çek", "keşideci");
    }
    // Senet tespiti
    else if (lowerText.includes("emre muharrer") || lowerText.includes("bono") || 
             lowerText.includes("senet") && lowerText.includes("vade")) {
      documentType = "SENET";
      suggestedCaseType = "KAMBIYO";
      matchedKeywords.push("senet", "bono");
    }
    // Fatura tespiti
    else if (lowerText.includes("fatura") || lowerText.includes("e-fatura") || 
             lowerText.includes("kdv") || lowerText.includes("vergi dairesi")) {
      documentType = "FATURA";
      suggestedCaseType = "ILAMSIZ";
      matchedKeywords.push("fatura", "kdv");
    }
    // Kira tespiti
    else if (lowerText.includes("kira") || lowerText.includes("kiracı") || 
             lowerText.includes("kiraya veren") || lowerText.includes("tahliye")) {
      documentType = "KIRA";
      suggestedCaseType = "KIRA";
      matchedKeywords.push("kira", "kiracı");
    }
    // Cari hesap tespiti
    else if (lowerText.includes("cari hesap") || lowerText.includes("bakiye") || 
             lowerText.includes("ekstre")) {
      documentType = "CARI_HESAP";
      suggestedCaseType = "ILAMSIZ";
      matchedKeywords.push("cari hesap", "bakiye");
    }

    // TC Kimlik No bul (11 haneli sayı)
    const tcknMatches = text.match(/\b(\d{11})\b/g);
    
    // VKN bul (10 haneli sayı)
    const vknMatch = text.match(/vergi\s*(?:no|numarası|kimlik)\s*[:\s]*(\d{10})/i);
    
    // Şirket adı bul
    const companyMatch = text.match(/([A-ZĞÜŞİÖÇ][A-ZĞÜŞİÖÇa-zğüşıöç\s]+(?:A\.?Ş\.?|LTD\.?\s*ŞTİ\.?|ANONİM\s*ŞİRKETİ|LİMİTED\s*ŞİRKETİ))/i);
    
    if (companyMatch) {
      parties.push({
        name: companyMatch[1].trim(),
        type: "COMPANY",
        role: "BORCLU",
        identityNo: vknMatch?.[1],
        confidence: 50,
      });
    }
    
    // Tutar bul
    const amountMatch = text.match(/(?:toplam|tutar|bedel|miktar)\s*[:\s]*([0-9.,]+)\s*(?:tl|₺|türk lirası)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/\./g, "").replace(",", ".")) : undefined;
    
    // Para birimi
    let currency: "TRY" | "USD" | "EUR" | "GBP" | "CHF" = "TRY";
    if (lowerText.includes("usd") || lowerText.includes("dolar")) currency = "USD";
    else if (lowerText.includes("eur") || lowerText.includes("euro")) currency = "EUR";
    
    // Tarih bul
    const dateMatch = text.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})/);
    const dueDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : undefined;
    
    // Belge no bul
    const docNoMatch = text.match(/(?:fatura|senet|çek|belge)\s*(?:no|numarası)\s*[:\s]*([A-Z0-9\-\/]+)/i);
    const documentNo = docNoMatch?.[1];

    return {
      documentType,
      parties,
      debtInfo: {
        amount,
        currency,
        dueDate,
        documentNo,
      },
      suggestedCaseType,
      confidence: 40,
      rawText: text.substring(0, 1000),
      matchedKeywords,
    };
  }

  /**
   * Vision API ile borç evrakı tarama (görüntü dosyaları için)
   */
  private async scanDebtDocumentWithVision(buffer: Buffer, mimeType: string): Promise<DebtDocumentResult> {
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
        throw new Error("PDF dosyası işlenemedi. Lütfen belge görüntüsünü (JPG, PNG) yükleyin.");
      }
    } else {
      imageMediaType = mimeType.includes("png") ? "image/png" : 
                       mimeType.includes("gif") ? "image/gif" : 
                       mimeType.includes("webp") ? "image/webp" : "image/jpeg";
    }

    this.logger.log("Vision API ile borç evrakı taranıyor...");

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
                text: `Bu bir Türk borç evrakıdır (fatura, senet, çek, kira sözleşmesi vb.). Belgedeki bilgileri analiz et ve JSON formatında döndür:

{
  "documentType": "FATURA|SENET|CEK|KIRA|CARI_HESAP|SOZLESME|DIGER",
  "parties": [
    {
      "name": "Ad Soyad veya Şirket Adı",
      "type": "INDIVIDUAL|COMPANY|PUBLIC_INSTITUTION",
      "role": "BORCLU|ALACAKLI|KEFIL|CIRANTA|AVAL|MUTESELSIL",
      "identityNo": "TCKN veya VKN",
      "address": "Adres",
      "city": "İl",
      "phone": "Telefon",
      "confidence": 0-100
    }
  ],
  "debtInfo": {
    "amount": 12345.67,
    "currency": "TRY|USD|EUR|GBP|CHF",
    "dueDate": "YYYY-MM-DD",
    "issueDate": "YYYY-MM-DD",
    "documentNo": "Belge numarası",
    "description": "Açıklama"
  },
  "bankInfo": {
    "bankName": "Banka adı (çek için)",
    "branchName": "Şube",
    "iban": "IBAN"
  },
  "suggestedCaseType": "ILAMLI|ILAMSIZ|KAMBIYO|KIRA",
  "confidence": 0-100,
  "matchedKeywords": ["kelime1", "kelime2"]
}

ROL TESPİTİ:
- Faturada: Alıcı = BORCLU, Satıcı = ALACAKLI
- Senette: Düzenleyen = BORCLU, Lehtar = ALACAKLI, Kefil = KEFIL
- Çekte: Keşideci = BORCLU, Lehtar = ALACAKLI, Ciranta = CIRANTA
- Kirada: Kiracı = BORCLU, Kiraya veren = ALACAKLI

Sadece JSON döndür.`
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
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`Vision API borç evrakı yanıtı: ${content}`);

      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      return {
        documentType: parsed.documentType || "DIGER",
        parties: (parsed.parties || []).map((p: any) => ({
          name: p.name || "",
          type: p.type || "INDIVIDUAL",
          role: p.role || "BORCLU",
          identityNo: p.identityNo,
          address: p.address,
          city: p.city,
          district: p.district,
          phone: p.phone,
          confidence: p.confidence || 70,
        })),
        debtInfo: {
          amount: parsed.debtInfo?.amount,
          currency: parsed.debtInfo?.currency || "TRY",
          dueDate: parsed.debtInfo?.dueDate,
          issueDate: parsed.debtInfo?.issueDate,
          documentNo: parsed.debtInfo?.documentNo,
          description: parsed.debtInfo?.description,
        },
        bankInfo: parsed.bankInfo,
        suggestedCaseType: parsed.suggestedCaseType || "ILAMSIZ",
        confidence: parsed.confidence || 70,
        matchedKeywords: parsed.matchedKeywords || [],
      };
    } catch (error: any) {
      this.logger.error("Vision API borç evrakı hatası:", error);
      throw new Error(`Borç evrakı görüntüsü analiz edilemedi: ${error.message}`);
    }
  }

  /**
   * Dış dosya (haciz yazısı) tarama - Alacak Haczi için
   * Haciz yazısı, dosya çıktısı, ihbarname cevabı vb.
   */
  async scanExternalCaseDocument(buffer: Buffer, mimeType: string, filename?: string): Promise<ExternalCaseDocumentResult> {
    // 1. Belgeden metin çıkar
    const { text } = await this.extractText(buffer, mimeType, filename);
    
    // Görüntü dosyası veya metin çıkarılamadıysa Vision API kullan
    const isImage = mimeType.startsWith("image/") || 
                    filename?.toLowerCase().endsWith(".jpg") ||
                    filename?.toLowerCase().endsWith(".jpeg") ||
                    filename?.toLowerCase().endsWith(".png");
    
    if (isImage || !text || text.length < 50) {
      this.logger.log("Metin çıkarılamadı veya görüntü dosyası, Vision API deneniyor...");
      return this.scanExternalCaseWithVision(buffer, mimeType);
    }

    this.logger.log(`Dış dosya tarama başlatılıyor. Metin uzunluğu: ${text.length}`);

    // 2. OpenAI ile analiz et
    if (!this.openai) {
      this.logger.warn("OpenAI yapılandırılmamış, kural tabanlı analiz yapılacak");
      return this.parseExternalCaseWithRules(text);
    }

    const model = this.configService.get<string>("OPENAI_MODEL") || "gpt-4";

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `Sen bir Türk icra hukuku uzmanısın. Verilen haciz yazısı veya icra dosyası çıktısını analiz ederek dosya bilgilerini çıkar.

Bu belge, borçlumuzun başka bir icra dosyasında ALACAKLI olduğu durumu gösterir. Biz bu dosyadaki alacağa haciz koymak istiyoruz.

Çıkarılacak bilgiler:
- İcra dairesi adı (örn: "İstanbul 5. İcra Dairesi")
- Dosya numarası (örn: "2024/12345")
- Karşı borçlu (dış dosyadaki borçlu - bizim borçlumuzun alacaklı olduğu kişi)
- Alacak tutarı ve para birimi
- Haciz tarihi (varsa)
- Belge türü

JSON formatında yanıt ver:
{
  "externalOffice": "İcra dairesi adı",
  "externalCaseNo": "Dosya numarası (2024/12345 formatında)",
  "counterpartyName": "Karşı borçlu adı/ünvanı",
  "counterpartyIdentityNo": "TCKN veya VKN (varsa)",
  "claimAmount": 12345.67,
  "claimCurrency": "TRY|USD|EUR",
  "attachmentDate": "YYYY-MM-DD (varsa)",
  "attachmentType": "BANKA|MAAS|TASINMAZ|ARAC|ALACAK|DIGER",
  "documentType": "HACIZ_YAZISI|DOSYA_CIKTISI|IHBARNAME_CEVABI|DIGER",
  "confidence": 0-100,
  "matchedKeywords": ["bulunan", "anahtar", "kelimeler"]
}`
          },
          {
            role: "user",
            content: `Aşağıdaki belgeyi analiz et ve dış dosya bilgilerini çıkar:\n\n${text.substring(0, 4000)}`
          }
        ],
        temperature: 0.1,
        ...(model.startsWith("o1") ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
      });

      const content = response.choices[0]?.message?.content || "{}";
      this.logger.debug(`OpenAI dış dosya yanıtı: ${content}`);

      const parsed = JSON.parse(content);

      return {
        externalOffice: parsed.externalOffice || undefined,
        externalCaseNo: parsed.externalCaseNo || undefined,
        counterpartyName: parsed.counterpartyName || undefined,
        counterpartyIdentityNo: parsed.counterpartyIdentityNo || undefined,
        claimAmount: parsed.claimAmount || undefined,
        claimCurrency: parsed.claimCurrency || "TRY",
        attachmentDate: parsed.attachmentDate || undefined,
        attachmentType: parsed.attachmentType || undefined,
        documentType: parsed.documentType || "DIGER",
        confidence: parsed.confidence || 70,
        rawText: text.substring(0, 1000),
        matchedKeywords: parsed.matchedKeywords || [],
      };
    } catch (error: any) {
      this.logger.error("OpenAI dış dosya analizi hatası:", error);
      return this.parseExternalCaseWithRules(text);
    }
  }

  /**
   * Kural tabanlı dış dosya analizi (OpenAI yoksa)
   */
  private parseExternalCaseWithRules(text: string): ExternalCaseDocumentResult {
    const lowerText = text.toLowerCase();
    const matchedKeywords: string[] = [];

    // İcra dairesi tespiti
    const officeMatch = text.match(/(\d+)\.\s*İcra\s*(?:Dairesi|Müdürlüğü)/i) ||
                        text.match(/([\wğüşıöçĞÜŞİÖÇ\s]+)\s*İcra\s*(?:Dairesi|Müdürlüğü)/i);
    const externalOffice = officeMatch ? officeMatch[0].trim() : undefined;
    if (externalOffice) matchedKeywords.push("icra dairesi");

    // Dosya numarası tespiti
    const caseNoMatch = text.match(/(?:Dosya\s*(?:No|Numarası)?|Esas\s*No)\s*[:\s]*(\d{4}\/\d+)/i) ||
                        text.match(/(\d{4}\/\d{3,})/);
    const externalCaseNo = caseNoMatch ? caseNoMatch[1] : undefined;
    if (externalCaseNo) matchedKeywords.push("dosya no");

    // Tutar tespiti
    const amountMatch = text.match(/(?:toplam|alacak|tutar|borç)\s*[:\s]*([\d.,]+)\s*(?:TL|TRY|₺|USD|\$|EUR|€)/i);
    let claimAmount: number | undefined;
    let claimCurrency: "TRY" | "USD" | "EUR" = "TRY";
    if (amountMatch) {
      claimAmount = parseFloat(amountMatch[1].replace(/\./g, "").replace(",", "."));
      if (amountMatch[0].includes("USD") || amountMatch[0].includes("$")) claimCurrency = "USD";
      else if (amountMatch[0].includes("EUR") || amountMatch[0].includes("€")) claimCurrency = "EUR";
      matchedKeywords.push("tutar");
    }

    // Karşı borçlu tespiti
    const counterpartyMatch = text.match(/(?:borçlu|davalı)\s*[:\s]*([A-ZĞÜŞİÖÇ][a-zğüşıöç]+(?:\s+[A-ZĞÜŞİÖÇ][a-zğüşıöç]+)*)/i);
    const counterpartyName = counterpartyMatch ? counterpartyMatch[1] : undefined;
    if (counterpartyName) matchedKeywords.push("borçlu");

    // Tarih tespiti
    const dateMatch = text.match(/(\d{2})[\.\/](\d{2})[\.\/](\d{4})/);
    const attachmentDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : undefined;

    // Belge türü tespiti
    let documentType: "HACIZ_YAZISI" | "DOSYA_CIKTISI" | "IHBARNAME_CEVABI" | "DIGER" = "DIGER";
    if (lowerText.includes("haciz müzekkeresi") || lowerText.includes("haciz yazısı")) {
      documentType = "HACIZ_YAZISI";
      matchedKeywords.push("haciz yazısı");
    } else if (lowerText.includes("dosya çıktısı") || lowerText.includes("dosya örneği")) {
      documentType = "DOSYA_CIKTISI";
      matchedKeywords.push("dosya çıktısı");
    } else if (lowerText.includes("ihbarname") && lowerText.includes("cevap")) {
      documentType = "IHBARNAME_CEVABI";
      matchedKeywords.push("ihbarname cevabı");
    }

    return {
      externalOffice,
      externalCaseNo,
      counterpartyName,
      claimAmount,
      claimCurrency,
      attachmentDate,
      documentType,
      confidence: matchedKeywords.length >= 3 ? 60 : 30,
      rawText: text.substring(0, 1000),
      matchedKeywords,
    };
  }

  /**
   * Vision API ile dış dosya tarama
   */
  private async scanExternalCaseWithVision(buffer: Buffer, mimeType: string): Promise<ExternalCaseDocumentResult> {
    if (!this.openai) {
      throw new Error("OpenAI yapılandırılmamış. Görüntü dosyaları için OpenAI API anahtarı gereklidir.");
    }

    let imageBuffer = buffer;
    let imageMediaType = "image/jpeg";

    // PDF ise görüntüye çevir
    if (mimeType === "application/pdf") {
      imageBuffer = await this.convertPdfToImage(buffer);
      imageMediaType = "image/jpeg";
    } else if (mimeType.startsWith("image/")) {
      imageMediaType = mimeType;
    }

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
                text: `Bu bir icra dosyası belgesi (haciz yazısı, dosya çıktısı veya ihbarname cevabı). Lütfen analiz et ve şu bilgileri JSON formatında çıkar:
{
  "externalOffice": "İcra dairesi adı",
  "externalCaseNo": "Dosya numarası (2024/12345)",
  "counterpartyName": "Karşı borçlu adı",
  "claimAmount": 12345.67,
  "claimCurrency": "TRY|USD|EUR",
  "attachmentDate": "YYYY-MM-DD",
  "documentType": "HACIZ_YAZISI|DOSYA_CIKTISI|IHBARNAME_CEVABI|DIGER",
  "confidence": 0-100
}`
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
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return {
        externalOffice: parsed.externalOffice || undefined,
        externalCaseNo: parsed.externalCaseNo || undefined,
        counterpartyName: parsed.counterpartyName || undefined,
        claimAmount: parsed.claimAmount || undefined,
        claimCurrency: parsed.claimCurrency || "TRY",
        attachmentDate: parsed.attachmentDate || undefined,
        documentType: parsed.documentType || "DIGER",
        confidence: parsed.confidence || 70,
        matchedKeywords: [],
      };
    } catch (error: any) {
      this.logger.error("Vision API dış dosya hatası:", error);
      throw new Error(`Dış dosya görüntüsü analiz edilemedi: ${error.message}`);
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
