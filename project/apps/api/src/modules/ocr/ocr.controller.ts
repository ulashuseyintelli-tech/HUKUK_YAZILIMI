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
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
          "text/plain",
          "application/octet-stream", // UDF dosyaları için
        ];
        // UDF uzantısı kontrolü
        const isUdf = file.originalname?.toLowerCase().endsWith(".udf");
        if (allowedMimes.includes(file.mimetype) || isUdf) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Desteklenmeyen dosya formatı. PDF, UDF, JPG, PNG veya TXT yükleyin."
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
        return {
          success: true,
          result: {
            ...result,
            confidence: Math.min(result.confidence, 30), // Dosya adından düşük güven
            explanation:
              "Dosya içeriği okunamadı, dosya adından tahmin yapıldı. " +
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
    const lower = filename.toLowerCase();
    const hints: string[] = [];

    if (lower.includes("ilam") || lower.includes("karar")) {
      hints.push("mahkemesi", "karar", "ilam");
    }
    if (lower.includes("nafaka")) {
      hints.push("nafaka", "aylık");
    }
    if (lower.includes("senet") || lower.includes("bono")) {
      hints.push("bono", "senet");
    }
    if (lower.includes("cek") || lower.includes("çek")) {
      hints.push("çek");
    }
    if (lower.includes("kira")) {
      hints.push("kira", "tahliye");
    }
    if (lower.includes("ipotek")) {
      hints.push("ipotek", "tapu");
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
      maxFileSize: "10MB",
      ocrSupport: {
        pdf: true,
        image: false, // Henüz aktif değil
        text: true,
      },
    };
  }
}
