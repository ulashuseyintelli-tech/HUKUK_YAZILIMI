import { Recipe } from '../../types/recipe.types';

/**
 * QUERY TAKBIS
 * 
 * TAKBİS (Tapu ve Kadastro Bilgi Sistemi) sorgusu.
 * Borçlunun taşınmaz (gayrimenkul) varlıklarını sorgular.
 */
export const QUERY_TAKBIS: Recipe = {
  recipeId: 'QueryTakbis',
  version: 1,
  name: 'Tapu Sorgusu (TAKBİS)',
  description: 'Borçlunun taşınmaz varlıklarını TAKBİS üzerinden sorgular',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERY_TAKBIS_REQUESTED',
      'event:RUN_ASSET_QUERIES_BATCH',
    ],
  },
  
  preconditions: [
    { field: 'debtor.identityNo', operator: 'isNotNull' }, // TCKN veya VKN
    { field: 'case.isFinalized', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Sorgular', 'Tapu Sorguları', 'TAKBİS Sorgusu'],
    screenId: 'TAKBIS_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'tasinmazSayisi', type: 'number' },
      { name: 'tasinmazlar', type: 'text' }, // JSON array
      { name: 'il', type: 'text' },
      { name: 'ilce', type: 'text' },
      { name: 'mahalle', type: 'text' },
      { name: 'ada', type: 'text' },
      { name: 'parsel', type: 'text' },
      { name: 'nitelik', type: 'text' },
      { name: 'hissePay', type: 'text' },
      { name: 'takyidatVar', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Taşınmaz bulundu → Haciz talebi hazırla
      if: 'tasinmazSayisi > 0',
      thenUpdate: {
        hasRealEstate: true,
        realEstateCount: '${tasinmazSayisi}',
      },
      thenEnqueue: ['PrepareRealEstateSeizure'],
    },
    {
      // Takyidatlı taşınmaz var → Uyarı
      if: 'takyidatVar == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'TAKBIS_HAS_ENCUMBRANCE',
        warningMessage: 'Taşınmaz üzerinde takyidat mevcut',
      },
    },
    {
      // Taşınmaz bulunamadı
      if: 'tasinmazSayisi == 0',
      thenUpdate: {
        hasRealEstate: false,
        takbisStatus: 'NO_PROPERTY_FOUND',
      },
    },
  ],
  
  actions: [
    { type: 'input', target: 'KimlikNo', value: '${debtor.identityNo}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 5000 },
  ],
  
  postconditions: [
    'debtor.lastTakbisQueryAt = now()',
    'case.events += TAKBIS_QUERY_COMPLETED',
  ],
  
  proof: {
    store: ['tasinmazSayisi', 'tasinmazlar', 'queryTimestamp'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  retry: {
    maxAttempts: 3,
    backoffMs: 300000,
  },
  
  priority: 'MEDIUM',
  isActive: true,
};
