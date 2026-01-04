import { Recipe } from '../../types/recipe.types';

/**
 * QUERY VEHICLE
 * 
 * Araç sorgusu (EGM/Trafik entegrasyonu).
 * Borçlunun kayıtlı araçlarını sorgular.
 */
export const QUERY_VEHICLE: Recipe = {
  recipeId: 'QueryVehicle',
  version: 1,
  name: 'Araç Sorgusu',
  description: 'Borçlunun kayıtlı araçlarını sorgular',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERY_VEHICLE_REQUESTED',
      'event:RUN_ASSET_QUERIES_BATCH',
    ],
  },
  
  preconditions: [
    { field: 'debtor.identityNo', operator: 'isNotNull' },
    { field: 'case.isFinalized', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Sorgular', 'Araç Sorguları', 'Araç Kayıt Sorgusu'],
    screenId: 'VEHICLE_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'aracSayisi', type: 'number' },
      { name: 'araclar', type: 'text' }, // JSON array
      { name: 'plaka', type: 'text' },
      { name: 'marka', type: 'text' },
      { name: 'model', type: 'text' },
      { name: 'modelYili', type: 'number' },
      { name: 'motorNo', type: 'text' },
      { name: 'sasiNo', type: 'text' },
      { name: 'tedbirVar', type: 'boolean' },
      { name: 'tedbirAciklama', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Araç bulundu → Haciz talebi hazırla
      if: 'aracSayisi > 0',
      thenUpdate: {
        hasVehicle: true,
        vehicleCount: '${aracSayisi}',
      },
      thenEnqueue: ['PrepareVehicleSeizure'],
    },
    {
      // Tedbir var → Uyarı
      if: 'tedbirVar == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'VEHICLE_HAS_RESTRICTION',
        warningMessage: '${tedbirAciklama}',
      },
    },
    {
      // Araç bulunamadı
      if: 'aracSayisi == 0',
      thenUpdate: {
        hasVehicle: false,
        vehicleStatus: 'NO_VEHICLE_FOUND',
      },
    },
  ],
  
  actions: [
    { type: 'input', target: 'KimlikNo', value: '${debtor.identityNo}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 3000 },
  ],
  
  postconditions: [
    'debtor.lastVehicleQueryAt = now()',
    'case.events += VEHICLE_QUERY_COMPLETED',
  ],
  
  proof: {
    store: ['aracSayisi', 'araclar', 'queryTimestamp'],
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
