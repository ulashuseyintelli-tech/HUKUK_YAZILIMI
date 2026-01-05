/**
 * EXTRACTOR LIBRARY CONFIG (v36)
 * 
 * Araç, haciz, e-tebligat, tahsilat için örnek extractor şablonları.
 * Bu şablonlar FactExtractorService tarafından kullanılır.
 */

export interface ExtractorTemplate {
  factType: string;
  keyFields: string[];
  when?: string;
  map: Record<string, string | Record<string, string>>;
}

export interface ExtractorLibrary {
  [key: string]: ExtractorTemplate[];
}

/**
 * Default extractor library
 * Production'da DB bundle'dan yüklenir
 */
export const EXTRACTOR_LIBRARY: ExtractorLibrary = {
  // Araç sorgu sonuçları
  vehicle_results: [
    {
      factType: 'AssetFound',
      keyFields: ['asset_fingerprint'],
      when: "plate != ''",
      map: {
        asset_type: 'vehicle',
        asset_fingerprint: 'vehicle:plate:{plate}',
        attributes: {
          plate: '{plate}',
          make: '{make}',
          model: '{model}',
          year: '{year}',
          vin: '{vin}',
        },
      },
    },
  ],

  // Araç haciz/rehin kayıtları
  vehicle_liens: [
    {
      factType: 'LienSnapshot',
      keyFields: ['lien_fingerprint'],
      when: "creditor != ''",
      map: {
        asset_fingerprint: 'vehicle:plate:{plate}',
        lien_fingerprint: '{creditor}|{lien_date}|{lien_type}|{reference_no}',
        lien_type: '{lien_type}',
        creditor: '{creditor}',
        lien_date: '{lien_date}',
        rank_order: '{rank_order}',
        amount_claimed: '{amount_claimed}',
        active_status: '{active_status}',
        reference_no: '{reference_no}',
      },
    },
  ],

  // E-tebligat durumları
  etebligat_status: [
    {
      factType: 'TebligatStatus',
      keyFields: ['debtor_id', 'status_key'],
      when: "status_key != ''",
      map: {
        channel: 'E_TEBLIGAT',
        debtor_id: '{debtor_id}',
        status_key: '{status_key}',
        delivered_at: '{tarafa_teslim_tarihi}',
        okundu: '{okundu}',
        mazbata: '{mazbata}',
      },
    },
  ],

  // Tahsilat kayıtları
  tahsilat_entries: [
    {
      factType: 'TahsilatEntry',
      keyFields: ['receipt_no'],
      when: "receipt_no != ''",
      map: {
        date: '{tarih}',
        amount: '{tutar}',
        receipt_no: '{receipt_no}',
        description: '{aciklama}',
      },
    },
  ],

  // Taşınmaz sorgu sonuçları
  real_estate_results: [
    {
      factType: 'AssetFound',
      keyFields: ['asset_fingerprint'],
      when: "tapu_no != ''",
      map: {
        asset_type: 'real_estate',
        asset_fingerprint: 'real_estate:tapu:{tapu_no}',
        attributes: {
          tapu_no: '{tapu_no}',
          il: '{il}',
          ilce: '{ilce}',
          mahalle: '{mahalle}',
          ada: '{ada}',
          parsel: '{parsel}',
          nitelik: '{nitelik}',
          yuzolcumu: '{yuzolcumu}',
        },
      },
    },
  ],

  // Banka hesap sonuçları
  bank_account_results: [
    {
      factType: 'AssetFound',
      keyFields: ['asset_fingerprint'],
      when: "iban != ''",
      map: {
        asset_type: 'bank_account',
        asset_fingerprint: 'bank:iban:{iban}',
        attributes: {
          iban: '{iban}',
          bank_name: '{bank_name}',
          branch: '{branch}',
          account_type: '{account_type}',
          currency: '{currency}',
        },
      },
    },
  ],

  // SGK kayıtları
  sgk_results: [
    {
      factType: 'AssetFound',
      keyFields: ['asset_fingerprint'],
      when: "employer_name != ''",
      map: {
        asset_type: 'sgk_employment',
        asset_fingerprint: 'sgk:employer:{employer_sicil_no}',
        attributes: {
          employer_name: '{employer_name}',
          employer_sicil_no: '{employer_sicil_no}',
          start_date: '{start_date}',
          status: '{status}',
        },
      },
    },
  ],

  // Haciz sonuçları
  haciz_results: [
    {
      factType: 'HacizPlaced',
      keyFields: ['haciz_fingerprint'],
      when: "haciz_no != ''",
      map: {
        haciz_fingerprint: '{haciz_no}|{asset_fingerprint}',
        asset_fingerprint: '{asset_fingerprint}',
        haciz_no: '{haciz_no}',
        haciz_date: '{haciz_date}',
        haciz_type: '{haciz_type}',
        amount: '{amount}',
        status: '{status}',
      },
    },
  ],
};

/**
 * Get extractor templates by name
 */
export function getExtractorTemplates(name: string): ExtractorTemplate[] {
  return EXTRACTOR_LIBRARY[name] || [];
}

/**
 * Get all extractor names
 */
export function getExtractorNames(): string[] {
  return Object.keys(EXTRACTOR_LIBRARY);
}
