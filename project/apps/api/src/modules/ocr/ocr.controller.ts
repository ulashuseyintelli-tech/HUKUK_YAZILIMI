import {
  Controller,
  Post,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OcrService, ClassificationResult } from "./ocr.service";

/**
 * Metin sınıflandırma DTO
 */
class ClassifyTextDto {
  text: string;
}

/**
 * Sınıflandırma yanıtı
 */
interface ClassifyResponse {
  success: boolean;
  result: ClassificationResult;
  extractedText?: string;
  extractionMethod?: string;
}

// PR-4: OCR yükleme dosya limiti — TEK KAYNAK (4 FileInterceptor + supported-formats).
const MAX_OCR_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_OCR_UPLOAD_LABEL = `${MAX_OCR_UPLOAD_BYTES / (1024 * 1024)}MB`; // "50MB"

@Controller("ocr")
@UseGuards(JwtAuthGuard)
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  /**
   * Metin içeriğini sınıflandır
   * POST /ocr/classify-text
   */
  @Post("classify-text")
  classifyText(@Body() dto: ClassifyTextDto): ClassifyResponse {
    if (!dto.text || dto.text.trim().length === 0) {
      throw new BadRequestException("Metin içeriği boş olamaz");
    }

    const result = this.ocrService.classifyDocument(dto.text);

    return {
      success: true,
      result,
    };
  }

  /**
   * Dosya yükle ve sınıflandır
   * POST /ocr/classify-file
   * Query param: useAI=true için OpenAI ile sınıflandırma
   */
  @Post("classify-file")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_OCR_UPLOAD_BYTES }, // 50MB (PR-4)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/tiff",
          "image/bmp",
          "text/plain",
          "text/rtf",
          "application/rtf",
          "application/octet-stream", // UDF dosyaları için
          "application/msword", // .doc (eski Word)
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        ];
        // Uzantı bazlı kontrol (MIME type güvenilir değil)
        const lowerName = file.originalname?.toLowerCase() || "";
        const allowedExtensions = [".udf", ".doc", ".docx", ".rtf", ".tiff", ".tif", ".bmp"];
        const hasAllowedExtension = allowedExtensions.some(ext => lowerName.endsWith(ext));
        
        if (allowedMimes.includes(file.mimetype) || hasAllowedExtension) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Desteklenmeyen dosya formatı. PDF, Word (DOC/DOCX), RTF, UDF, JPG, PNG, TIFF veya TXT yükleyin."
            ),
            false
          );
        }
      },
    })
  )
  async classifyFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { useAI?: string }
  ): Promise<ClassifyResponse> {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    const useAI = body?.useAI === "true";

    // Metin çıkar (UDF dosyaları için filename gerekli)
    const { text, method } = await this.ocrService.extractText(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    if (!text || text.trim().length === 0) {
      // Metin çıkarılamadıysa, dosya adından ipucu almaya çalış
      const filenameHints = this.extractHintsFromFilename(file.originalname);
      if (filenameHints) {
        const result = useAI 
          ? await this.ocrService.classifyDocumentWithAI(filenameHints)
          : this.ocrService.classifyDocument(filenameHints);
        
        // Dosya adından tahmin yapıldığında güven skoru
        const adjustedConfidence = Math.min(result.confidence, 70);
        
        return {
          success: true,
          result: {
            ...result,
            confidence: adjustedConfidence,
            explanation:
              `📁 Dosya içeriği okunamadı (taranmış PDF veya özel format olabilir). Dosya adı "${file.originalname}" üzerinden tahmin yapıldı. ` +
              result.explanation,
          },
          extractedText: "",
          extractionMethod: "filename-hint",
        };
      }

      throw new BadRequestException(
        "Dosyadan metin çıkarılamadı. Lütfen metin içeren bir belge yükleyin veya manuel olarak takip türünü seçin."
      );
    }

    // Sınıflandır - AI veya Rule-based
    const result = useAI 
      ? await this.ocrService.classifyDocumentWithAI(text)
      : this.ocrService.classifyDocument(text);

    return {
      success: true,
      result,
      extractedText: text.substring(0, 1000), // İlk 1000 karakter
      extractionMethod: useAI ? `${method}+ai` : method,
    };
  }

  /**
   * Dosya adından ipuçları çıkar
   */
  private extractHintsFromFilename(filename: string): string | null {
    // Türkçe karakterleri normalize et
    const lower = filename
      .toLowerCase()
      .replace(/İ/g, "i")
      .replace(/I/g, "ı")
      .replace(/Ğ/g, "ğ")
      .replace(/Ü/g, "ü")
      .replace(/Ş/g, "ş")
      .replace(/Ö/g, "ö")
      .replace(/Ç/g, "ç");
    
    const hints: string[] = [];

    // İlamlı takip
    if (lower.includes("ilam") || lower.includes("karar") || lower.includes("mahkeme")) {
      hints.push("mahkemesi", "karar", "ilam", "hüküm");
    }
    
    // Nafaka
    if (lower.includes("nafaka")) {
      hints.push("nafaka", "aylık", "iştirak nafakası", "yoksulluk nafakası");
    }
    
    // Kambiyo - Senet/Bono
    if (lower.includes("senet") || lower.includes("bono")) {
      hints.push("bono", "senet", "emre muharrer", "vade");
    }
    
    // Kambiyo - Çek
    if (lower.includes("cek") || lower.includes("çek")) {
      hints.push("çek", "banka", "keşideci", "hamiline");
    }
    
    // Kira
    if (lower.includes("kira") || lower.includes("kiralama") || lower.includes("sozlesme") || lower.includes("sözleşme")) {
      hints.push("kira", "tahliye", "kiracı", "kiraya veren", "kira bedeli");
    }
    
    // İpotek
    if (lower.includes("ipotek") || lower.includes("tapu") || lower.includes("gayrimenkul")) {
      hints.push("ipotek", "tapu", "gayrimenkul", "taşınmaz", "ada", "parsel", "tapu sicil");
    }
    
    // Rehin
    if (lower.includes("rehin") || lower.includes("teminat")) {
      hints.push("rehin", "teminat", "taşınır rehni");
    }
    
    // Fatura / Alacak
    if (lower.includes("fatura") || lower.includes("alacak") || lower.includes("borc") || lower.includes("borç")) {
      hints.push("fatura", "alacak", "borç", "ödeme");
    }

    return hints.length > 0 ? hints.join(" ") : null;
  }

  /**
   * Desteklenen dosya formatlarını listele
   * POST /ocr/supported-formats
   */
  @Post("supported-formats")
  getSupportedFormats() {
    return {
      formats: [
        { mime: "application/pdf", extension: ".pdf", description: "PDF Belgesi" },
        { mime: "image/jpeg", extension: ".jpg", description: "JPEG Görüntü" },
        { mime: "image/png", extension: ".png", description: "PNG Görüntü" },
        { mime: "text/plain", extension: ".txt", description: "Metin Dosyası" },
      ],
      maxFileSize: MAX_OCR_UPLOAD_LABEL,
      ocrSupport: {
        pdf: true,
        image: false, // Henüz aktif değil
        text: true,
      },
    };
  }

  /**
   * Borç evrakı tara ve bilgileri çıkar (Borçlu Sihirbazı için)
   * POST /ocr/scan-debt-document
   * Fatura, senet, çek, kira sözleşmesi, cari hesap ekstresi vb.
   */
  @Post("scan-debt-document")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_OCR_UPLOAD_BYTES }, // 50MB (PR-4)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/tiff",
          "image/bmp",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        const lowerName = file.originalname?.toLowerCase() || "";
        const allowedExtensions = [".udf", ".doc", ".docx", ".tiff", ".tif"];
        const hasAllowedExtension = allowedExtensions.some(ext => lowerName.endsWith(ext));
        
        if (allowedMimes.includes(file.mimetype) || hasAllowedExtension) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin."
            ),
            false
          );
        }
      },
    })
  )
  async scanDebtDocument(
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    const result = await this.ocrService.scanDebtDocument(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Dış dosya belgesi tara (Alacak Haczi için)
   * POST /ocr/scan-external-case
   * Haciz yazısı, dosya çıktısı, ihbarname cevabı vb.
   */
  @Post("scan-external-case")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_OCR_UPLOAD_BYTES }, // 50MB (PR-4)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/tiff",
          "image/bmp",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        const lowerName = file.originalname?.toLowerCase() || "";
        const allowedExtensions = [".udf", ".doc", ".docx", ".tiff", ".tif"];
        const hasAllowedExtension = allowedExtensions.some(ext => lowerName.endsWith(ext));
        
        if (allowedMimes.includes(file.mimetype) || hasAllowedExtension) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin."
            ),
            false
          );
        }
      },
    })
  )
  async scanExternalCaseDocument(
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    const result = await this.ocrService.scanExternalCaseDocument(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Vekaletname belgesi tara ve bilgileri çıkar
   * POST /ocr/scan-poa (Power of Attorney)
   */
  @Post("scan-poa")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_OCR_UPLOAD_BYTES }, // 50MB (PR-4)
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/tiff",
          "image/bmp",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        const lowerName = file.originalname?.toLowerCase() || "";
        const allowedExtensions = [".udf", ".doc", ".docx", ".tiff", ".tif"];
        const hasAllowedExtension = allowedExtensions.some(ext => lowerName.endsWith(ext));
        
        if (allowedMimes.includes(file.mimetype) || hasAllowedExtension) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin."
            ),
            false
          );
        }
      },
    })
  )
  async scanPowerOfAttorney(
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    const result = await this.ocrService.scanPowerOfAttorney(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    return {
      success: true,
      data: result,
    };
  }
}
