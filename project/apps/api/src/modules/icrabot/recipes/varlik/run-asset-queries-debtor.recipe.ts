import { Recipe } from '../../types/recipe.types';

/**
 * RUN ASSET QUERIES - DEBTOR SCOPED
 * 
 * v2: Borçlu bazlı varlık sorguları.
 * Her borçlu için ayrı job üretilir ve paralel çalıştırılır.
 * 
 * Sorgular:
 * - SGK kaydı / işyeri
 * - Tapu (TAKBİS)
 * - Araç (araç/tedbir/taşıt bilgisi)
 * - Banka/hesap/menkul kıymet
 * - Ticaret Sicil (tüzel kişiler için)
 * 
 * Kitap referansı: UYAP kurumlar arası entegrasyonlar
 */
export const RUN_ASSET_QUERIES_DEBTOR: Recipe = {
  recipeId: 'RunAssetQueries_Debtor',
  version: 2,
  name: 'Varlık Sorguları (Borçlu Bazlı)',
  description: 'Tek borçlu için varlık sorgularını çalıştırır',
  
  // v2: Debtor-scoped
  scope: 'debtor',
  
  stageTags: ['VARLIK'],
  
  trigger: {
    type: 'schedule',
    when: ['schedule:EVERY_7_DAYS'],
  },
  
  // v2: Guard - kesinleşme sonrası çalışır
  guard: 'FINALIZED',
  
  preconditions: [
    'session.isLoggedIn == true',
    'case.events contains FINALIZED',
    'runtime.debtorScopeId != null',
  ],
  
  uyapNavPath: ['Sorgular', 'Toplu Entegrasyon Sorgu'],
  
  read: {
    table: 'toplu_entegrasyon_sorgu',
    fields: ['sgkResult', 'takbisResult', 'vehicleResult', 'otherAssets'],
    filters: {
      debtorId: '{{runtime.debtorScopeId}}',
    },
  },
  
  actions: [
    {
      type: 'query',
      input: {
        debtorIds: '{{runtime.debtorScopeId}}',
      },
    },
  ],
  
  decisions: [
    {
      // Varlık bulundu → Skorlama yap
      if: 'hasAssets == true',
      then: {
        enqueue: ['ScoreAssetProfile_Debtor'],
      },
    },
    {
      // Varlık bulunamadı → Düşük tahsilat riski işaretle
      if: 'hasAssets == false',
      then: {
        set_flag: 'debtor.lowRecovery=true',
      },
    },
  ],
  
  postconditions: [
    'case.events += ASSET_PROFILE_READY(debtor_id=runtime.debtorScopeId)',
  ],
  
  proof: {
    store: ['timestamp', 'assetProfileHash', 'runtime.debtorScopeId'],
  },
  
  audit: {
    level: 'read_only', // Okuma işlemi
    retainDays: 3650,
  },
  
  requiresApproval: false,
  
  retry: {
    maxAttempts: 4,
    backoffSeconds: [30, 120, 600, 1800], // 30s, 2m, 10m, 30m
  },
  
  priority: 'NORMAL',
  isActive: true,
};
