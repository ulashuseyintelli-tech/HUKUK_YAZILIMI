import { Injectable, BadRequestException } from '@nestjs/common';
import { DocumentValidationResult } from './dto/uyap-export.dto';
import { UyapEvrak, UyapEvrakTuru } from './uyap-xml.types';

/**
 * UYAP Belge Standartları:
 * - Format: TIFF (image/tiff)
 * - Max boyut: 500 KB
 * - Çözünürlük: 75-100 DPI
 * - Max uzun kenar: 1300 piksel
 * - Sıkıştırma: Group4 (CCITT Fax 4)
 * - Renk: Siyah-Beyaz (1-bit)
 */
@Injectable()
export class UyapDocumentService {
  // UYAP belge standartları
  private readonly MAX_FILE_SIZE = 500 * 1024; // 500 KB
  private readonly MAX_DIMENSION = 1300; // piksel
  private readonly MIN_DPI = 75;
  private readonly MAX_DPI = 100;
  private readonly ALLOWED_MIME_TYPES = ['image/tiff', 'image/tif'];

  /**
   * Belgeyi UYAP standartlarına göre doğrula
   */
  async validateDocument(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<DocumentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // MIME type kontrolü
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      errors.push(
        `Geçersiz dosya formatı: ${mimeType}. UYAP sadece TIFF formatını kabul eder.`
      );
    }

    // Dosya boyutu kontrolü
    if (buffer.length > this.MAX_FILE_SIZE) {
      errors.push(
        `Dosya boyutu çok büyük: ${(buffer.length / 1024).toFixed(1)} KB. ` +
        `Maksimum: ${this.MAX_FILE_SIZE / 1024} KB`
      );
    }

    // TIFF header kontrolü (basit)
    if (!this.isTiffFile(buffer)) {
      errors.push('Dosya geçerli bir TIFF dosyası değil');
    }

    // TODO: Sharp veya benzeri kütüphane ile detaylı kontrol
    // - Boyut (width/height)
    // - DPI
    // - Renk derinliği (1-bit olmalı)
    // - Sıkıştırma türü (Group4)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileInfo: {
        originalName,
        size: buffer.length,
        mimeType,
      },
    };
  }

  /**
   * Belgeyi UYAP formatına dönüştür
   * 
   * Dönüşüm adımları:
   * 1. Görüntüyü siyah-beyaza çevir
   * 2. Boyutu ayarla (max 1300px)
   * 3. DPI'ı ayarla (75-100)
   * 4. Group4 sıkıştırma uygula
   * 5. TIFF olarak kaydet
   */
  async convertToUyapFormat(
    buffer: Buffer,
    _originalName: string
  ): Promise<Buffer> {
    // TODO: Sharp kütüphanesi ile implementasyon
    // const sharp = require('sharp');
    // 
    // return await sharp(buffer)
    //   .grayscale()
    //   .threshold(128) // Siyah-beyaz
    //   .resize({
    //     width: this.MAX_DIMENSION,
    //     height: this.MAX_DIMENSION,
    //     fit: 'inside',
    //     withoutEnlargement: true,
    //   })
    //   .tiff({
    //     compression: 'ccittfax4', // Group4
    //     quality: 100,
    //     bitdepth: 1,
    //   })
    //   .toBuffer();

    // Şimdilik orijinal buffer'ı döndür
    console.warn('UYAP belge dönüşümü henüz implement edilmedi');
    return buffer;
  }

  /**
   * Belgeyi Base64 encoded UYAP evrak formatına dönüştür
   */
  async prepareDocumentForXml(
    buffer: Buffer,
    originalName: string,
    documentType: UyapEvrakTuru,
    description?: string
  ): Promise<UyapEvrak> {
    // Önce doğrula
    const validation = await this.validateDocument(
      buffer,
      originalName,
      'image/tiff'
    );

    if (!validation.isValid) {
      throw new BadRequestException(
        `Belge UYAP standartlarına uygun değil: ${validation.errors.join(', ')}`
      );
    }

    // Base64'e çevir
    const base64Content = buffer.toString('base64');

    return {
      tur: documentType,
      aciklama: description,
      dosyaAdi: originalName.replace(/\.[^.]+$/, '.tiff'),
      mimeType: 'image/tiff',
      icerik: base64Content,
      boyut: buffer.length,
    };
  }

  /**
   * Basit TIFF header kontrolü
   */
  private isTiffFile(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;

    // TIFF magic bytes: II (little-endian) veya MM (big-endian)
    const header = buffer.slice(0, 4);
    
    // Little-endian: 49 49 2A 00
    if (header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00) {
      return true;
    }
    
    // Big-endian: 4D 4D 00 2A
    if (header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a) {
      return true;
    }

    return false;
  }

  /**
   * Belge türünü dosya adından tahmin et
   */
  guessDocumentType(fileName: string): UyapEvrakTuru {
    const lowerName = fileName.toLowerCase();

    if (lowerName.includes('vekaletname') || lowerName.includes('vekalet')) {
      return 'VEKALETNAME';
    }
    if (lowerName.includes('cek') || lowerName.includes('çek')) {
      return 'CEK';
    }
    if (lowerName.includes('senet') || lowerName.includes('bono')) {
      return 'SENET';
    }
    if (lowerName.includes('ilam') || lowerName.includes('karar')) {
      return 'ILAM';
    }
    if (lowerName.includes('takip') || lowerName.includes('talep')) {
      return 'TAKIP_TALEBI';
    }

    return 'DIGER';
  }

  /**
   * Belge boyutunu insan okunabilir formata çevir
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
