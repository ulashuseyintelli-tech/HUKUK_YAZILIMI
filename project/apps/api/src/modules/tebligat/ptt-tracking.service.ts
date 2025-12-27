import { Injectable, Logger } from '@nestjs/common';
import { TebligatPttResult } from './dto/tebligat.dto';

export interface PttTrackingResult {
  barcodeNo: string;
  status: string;
  statusCode: string;
  lastUpdate: Date;
  deliveryDate?: Date;
  recipientName?: string;
  deliveryLocation?: string;
  events: PttTrackingEvent[];
  mappedResult?: TebligatPttResult;
}

export interface PttTrackingEvent {
  date: Date;
  location: string;
  status: string;
  description: string;
}

// PTT durum kodlari ve karsiliklari
const PTT_STATUS_MAP: Record<string, TebligatPttResult> = {
  'TESLIM_EDILDI': TebligatPttResult.TESLIM_EDILDI,
  'DELIVERED': TebligatPttResult.TESLIM_EDILDI,
  'AYNI_KONUTTA': TebligatPttResult.AYNI_KONUTTA_TESLIM,
  'ISYERINDE': TebligatPttResult.ISYERINDE_TESLIM,
  'ADRESTE_BULUNAMADI': TebligatPttResult.ADRESTE_BULUNAMADI,
  'NOT_FOUND': TebligatPttResult.ADRESTE_BULUNAMADI,
  'TASINMIS': TebligatPttResult.TASINMIS,
  'MOVED': TebligatPttResult.TASINMIS,
  'ADRES_YETERSIZ': TebligatPttResult.ADRES_YETERSIZ,
  'INSUFFICIENT_ADDRESS': TebligatPttResult.ADRES_YETERSIZ,
  'BINA_YIKILMIS': TebligatPttResult.BINA_YIKILMIS,
  'BUILDING_DEMOLISHED': TebligatPttResult.BINA_YIKILMIS,
  'KAPALI': TebligatPttResult.ADRES_KAPALI,
  'CLOSED': TebligatPttResult.ADRES_KAPALI,
  'IMTINA': TebligatPttResult.IMTINA,
  'REFUSED': TebligatPttResult.IMTINA,
  'MUHTARLIK': TebligatPttResult.MUHTARLIGA_BIRAKILDI,
  'LEFT_AT_MUKHTAR': TebligatPttResult.MUHTARLIGA_BIRAKILDI,
  'VEFAT': TebligatPttResult.VEFAT,
  'DECEASED': TebligatPttResult.VEFAT,
  'TANIMIYOR': TebligatPttResult.TANIMIYOR,
  'UNKNOWN_RECIPIENT': TebligatPttResult.TANIMIYOR,
};

@Injectable()
export class PttTrackingService {
  private readonly logger = new Logger(PttTrackingService.name);

  /**
   * PTT barkod sorgulama
   * NOT: Gercek PTT API'si olmadigi icin simule ediyoruz
   * Gercek entegrasyon icin PTT'nin web servisine baglanti gerekir
   */
  async trackBarcode(barcodeNo: string): Promise<PttTrackingResult | null> {
    this.logger.log(`PTT barkod sorgulaniyor: ${barcodeNo}`);

    try {
      // Gercek PTT API cagirisi burada yapilacak
      // Simdilik mock data donuyoruz
      
      // PTT API URL ornegi (gercek URL PTT'den alinmali):
      // const response = await fetch(`https://ptt.gov.tr/api/tracking/${barcodeNo}`);
      // const data = await response.json();

      // Mock response - gercek entegrasyonda kaldirilacak
      const mockResult = this.getMockTrackingResult(barcodeNo);
      
      return mockResult;
    } catch (error) {
      this.logger.error(`PTT sorgulama hatasi: ${error.message}`);
      return null;
    }
  }

  /**
   * Toplu barkod sorgulama
   */
  async trackMultipleBarcodes(barcodeNos: string[]): Promise<Map<string, PttTrackingResult | null>> {
    const results = new Map<string, PttTrackingResult | null>();

    for (const barcodeNo of barcodeNos) {
      const result = await this.trackBarcode(barcodeNo);
      results.set(barcodeNo, result);
      
      // Rate limiting - PTT API'sini yormamak icin
      await this.delay(500);
    }

    return results;
  }

  /**
   * PTT durum kodunu TebligatPttResult'a cevir
   */
  mapPttStatusToResult(pttStatus: string): TebligatPttResult {
    const normalizedStatus = pttStatus.toUpperCase().replace(/\s+/g, '_');
    
    // Direkt esleme
    if (PTT_STATUS_MAP[normalizedStatus]) {
      return PTT_STATUS_MAP[normalizedStatus];
    }

    // Kismen esleme
    for (const [key, value] of Object.entries(PTT_STATUS_MAP)) {
      if (normalizedStatus.includes(key)) {
        return value;
      }
    }

    return TebligatPttResult.DIGER;
  }

  /**
   * Mock tracking result - test icin
   */
  private getMockTrackingResult(barcodeNo: string): PttTrackingResult {
    // Barkod numarasina gore farkli sonuclar don
    const lastDigit = parseInt(barcodeNo.slice(-1)) || 0;
    
    const statuses = [
      { status: 'TESLIM_EDILDI', statusCode: '100' },
      { status: 'AYNI_KONUTTA', statusCode: '101' },
      { status: 'ISYERINDE', statusCode: '102' },
      { status: 'ADRESTE_BULUNAMADI', statusCode: '200' },
      { status: 'TASINMIS', statusCode: '201' },
      { status: 'ADRES_YETERSIZ', statusCode: '202' },
      { status: 'IMTINA', statusCode: '300' },
      { status: 'MUHTARLIK', statusCode: '301' },
      { status: 'DAGITIMDA', statusCode: '050' },
      { status: 'ISLEM_BEKLIYOR', statusCode: '010' },
    ];

    const selectedStatus = statuses[lastDigit % statuses.length];
    const isDelivered = ['100', '101', '102'].includes(selectedStatus.statusCode);

    return {
      barcodeNo,
      status: selectedStatus.status,
      statusCode: selectedStatus.statusCode,
      lastUpdate: new Date(),
      deliveryDate: isDelivered ? new Date() : undefined,
      recipientName: isDelivered ? 'ALICI ADI' : undefined,
      deliveryLocation: isDelivered ? 'ISTANBUL' : undefined,
      events: [
        {
          date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          location: 'ISTANBUL DAGITIM',
          status: 'KABUL',
          description: 'Gonderiniz kabul edildi',
        },
        {
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          location: 'ISTANBUL AKTARMA',
          status: 'AKTARMA',
          description: 'Gonderiniz aktarma merkezinde',
        },
        {
          date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          location: 'HEDEF DAGITIM',
          status: 'DAGITIMDA',
          description: 'Gonderiniz dagitima cikarildi',
        },
        {
          date: new Date(),
          location: 'HEDEF ADRES',
          status: selectedStatus.status,
          description: this.getStatusDescription(selectedStatus.status),
        },
      ],
      mappedResult: this.mapPttStatusToResult(selectedStatus.status),
    };
  }

  private getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      'TESLIM_EDILDI': 'Gonderiniz teslim edildi',
      'AYNI_KONUTTA': 'Ayni konutta baskasina teslim edildi',
      'ISYERINDE': 'Isyerinde teslim edildi',
      'ADRESTE_BULUNAMADI': 'Alici adreste bulunamadi',
      'TASINMIS': 'Alici tasinmis',
      'ADRES_YETERSIZ': 'Adres bilgisi yetersiz',
      'IMTINA': 'Alici teslim almaktan imtina etti',
      'MUHTARLIK': 'Muhtarliga birakildi',
      'DAGITIMDA': 'Dagitimda',
      'ISLEM_BEKLIYOR': 'Islem bekliyor',
    };
    return descriptions[status] || 'Durum bilinmiyor';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
