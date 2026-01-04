/**
 * FETCH PRIOR LIENS RECIPE
 * 
 * Varlık üzerindeki mevcut haciz/rehin/tedbir kayıtlarını çeker.
 * decision_rules_v4.yaml: R2_ASSET_FOUND_FETCH_LIENS_AND_VALUE
 */

import { Recipe } from '../../types/recipe.types';

export const FetchPriorLiensVehicleRecipe: Recipe = {
  recipeId: 'FetchPriorLiens_Vehicle',
  version: 1,
  name: 'Araç Ön Haciz Sorgula',
  description: 'Araç üzerindeki mevcut haciz, rehin ve tedbir kayıtlarını UYAP\'tan çeker',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_FOUND(asset_type=vehicle)'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'case.uyap_dosya_no != null',
    'runtime.debtor_scope_id != null',
    'asset.type == VEHICLE',
    'asset.plate != null',
  ],
  
  uyapNavPath: ['Sorgular', 'Araç Sorgu', 'Haciz/Rehin Bilgileri'],
  
  read: {
    table: 'arac_haciz_rehin',
    fields: [
      'haciz_tarihi',
      'haciz_turu',
      'alacakli_adi',
      'alacakli_turu',
      'alacak_tutari',
      'para_birimi',
      'sira_no',
      'durum',
      'kaldirma_tarihi',
      'icra_dairesi',
      'dosya_no',
    ],
    filters: {
      plaka: '{{asset.plate}}',
    },
  },
  
  decisions: [
    {
      if: 'haciz_rehin_count > 0',
      then: {
        set_flag: 'asset.has_prior_liens=true',
        enqueue: ['CalculateLienRank_Vehicle'],
      },
    },
    {
      if: 'haciz_rehin_count == 0',
      then: {
        set_flag: 'asset.has_prior_liens=false',
        set: 'asset.our_rank=1',
      },
    },
    {
      if: 'any(haciz_rehin.durum == AKTIF)',
      then: {
        enqueue: ['AssessParticipationRisk'],
      },
    },
  ],
  
  actions: [
    {
      type: 'query',
      input: {
        plaka: '{{asset.plate}}',
        sorgu_turu: 'HACIZ_REHIN',
      },
    },
  ],
  
  postconditions: [
    'case.events += LIEN_SNAPSHOT(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.prior_liens_checked_at = now()',
  ],
  
  proof: {
    store: [
      'timestamp',
      'snapshot_hash',
      'runtime.debtor_scope_id',
      'asset.plate',
      'haciz_rehin_count',
      'total_prior_claims',
    ],
  },
  
  audit: {
    level: 'read_only',
    retainDays: 3650,
    includeScreenshotOnError: true,
  },
  
  retry: {
    maxAttempts: 3,
    backoffSeconds: [30, 120, 600],
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RunAssetQueries_Debtor'],
  emits: ['LIEN_SNAPSHOT', 'PRIOR_LIENS_DETECTED'],
  guard: 'ASSET_FOUND && asset.type == VEHICLE',
};

export const FetchPriorLiensRealEstateRecipe: Recipe = {
  recipeId: 'FetchPriorLiens_RealEstate',
  version: 1,
  name: 'Taşınmaz Ön Haciz Sorgula',
  description: 'Taşınmaz üzerindeki mevcut haciz, ipotek ve tedbir kayıtlarını TAKBİS\'ten çeker',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_FOUND(asset_type=real_estate)'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'case.uyap_dosya_no != null',
    'runtime.debtor_scope_id != null',
    'asset.type == REAL_ESTATE',
    'asset.tapu_no != null',
  ],
  
  uyapNavPath: ['Sorgular', 'TAKBİS Sorgu', 'Takyidat Bilgileri'],
  
  read: {
    table: 'tasinmaz_takyidat',
    fields: [
      'takyidat_tarihi',
      'takyidat_turu', // HACIZ, IPOTEK, TEDBIR, SERH
      'alacakli_adi',
      'alacakli_turu',
      'alacak_tutari',
      'para_birimi',
      'derece', // İpotek derecesi
      'sira_no',
      'durum',
      'terkin_tarihi',
      'icra_dairesi',
      'dosya_no',
      'yevmiye_no',
    ],
    filters: {
      tapu_no: '{{asset.tapu_no}}',
    },
  },
  
  decisions: [
    {
      if: 'takyidat_count > 0',
      then: {
        set_flag: 'asset.has_prior_liens=true',
        enqueue: ['CalculateLienRank_RealEstate'],
      },
    },
    {
      if: 'any(takyidat.takyidat_turu == IPOTEK && takyidat.durum == AKTIF)',
      then: {
        set_flag: 'asset.has_active_mortgage=true',
        enqueue: ['AssessParticipationRisk'],
      },
    },
  ],
  
  actions: [
    {
      type: 'query',
      input: {
        tapu_no: '{{asset.tapu_no}}',
        il: '{{asset.il}}',
        ilce: '{{asset.ilce}}',
        sorgu_turu: 'TAKYIDAT',
      },
    },
  ],
  
  postconditions: [
    'case.events += LIEN_SNAPSHOT(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.prior_liens_checked_at = now()',
  ],
  
  proof: {
    store: [
      'timestamp',
      'snapshot_hash',
      'runtime.debtor_scope_id',
      'asset.tapu_no',
      'takyidat_count',
      'total_prior_claims',
      'ipotek_count',
    ],
  },
  
  audit: {
    level: 'read_only',
    retainDays: 3650,
    includeScreenshotOnError: true,
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RunAssetQueries_Debtor'],
  emits: ['LIEN_SNAPSHOT', 'PRIOR_LIENS_DETECTED'],
  guard: 'ASSET_FOUND && asset.type == REAL_ESTATE',
};

export default [FetchPriorLiensVehicleRecipe, FetchPriorLiensRealEstateRecipe];
