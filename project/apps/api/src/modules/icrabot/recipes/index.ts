/**
 * RECIPE REGISTRY
 * 
 * Tüm bot tariflerinin merkezi kaydı.
 * v1 + v2 + v3 blueprint'lerinden entegre edilmiştir.
 */

import { Recipe } from '../types/recipe.types';

// Session modülü
import { ENSURE_UYAP_SESSION } from './session/ensure-uyap-session.recipe';

// Senkronizasyon modülü
import { SYNC_SAFAHAT } from './sync/sync-safahat.recipe';
import { INFER_STAGE_FROM_SIGNALS } from './sync/infer-stage-from-signals.recipe';
import { BIND_CASE_TO_UYAP } from './sync/bind-case-to-uyap.recipe';
import { SYNC_CASE_HEADER } from './sync/sync-case-header.recipe';
import { SYNC_EVRAK_INDEX } from './sync/sync-evrak-index.recipe';
import { CONSISTENCY_CHECK } from './sync/consistency-check.recipe';
import { ERROR_QUARANTINE } from './sync/error-quarantine.recipe';

// Tebligat modülü (case-scoped)
import { FETCH_ETEBLIGAT_STATUSES } from './tebligat/fetch-etebligat-statuses.recipe';
import { COMPUTE_LEGAL_SERVICE_DATE } from './tebligat/compute-legal-service-date.recipe';
import { MAZBATA_SORGULA } from './tebligat/mazbata-sorgula.recipe';
import { FETCH_PHYSICAL_TEBLIGAT } from './tebligat/fetch-physical-tebligat.recipe';
import { OPEN_RETEBLIGAT_BRANCH } from './tebligat/open-retebligat-branch.recipe';

// Tebligat modülü (debtor-scoped) - v3
import { FETCH_ETEBLIGAT_DEBTOR } from './tebligat/fetch-etebligat-debtor.recipe';
import { COMPUTE_SERVICE_DATE_DEBTOR } from './tebligat/compute-service-date-debtor.recipe';
import { MAZBATA_SORGULA_DEBTOR } from './tebligat/mazbata-sorgula-debtor.recipe';

// Kesinleşme modülü
import { DETECT_FINALIZATION } from './kesinlesme/detect-finalization.recipe';
import { MARK_AS_FINALIZED } from './kesinlesme/mark-as-finalized.recipe';
import { DETECT_FINALIZATION_BY_ICRA_TYPE } from './kesinlesme/detect-finalization-by-icra-type.recipe';

// Varlık sorgu modülü
import { RUN_ASSET_QUERIES } from './varlik/run-asset-queries.recipe';
import { RUN_ASSET_QUERIES_DEBTOR } from './varlik/run-asset-queries-debtor.recipe';
import { QUERY_SGK } from './varlik/query-sgk.recipe';
import { QUERY_TAKBIS } from './varlik/query-takbis.recipe';
import { QUERY_VEHICLE } from './varlik/query-vehicle.recipe';
import { QUERY_BANK_ACCOUNTS } from './varlik/query-bank.recipe';
import { QUERY_TRADE_REGISTRY } from './varlik/query-trade-registry.recipe';
import { SCORE_ASSET_PROFILE } from './varlik/score-asset-profile.recipe';
import { PROPOSE_HACIZ_PACKAGE } from './varlik/propose-haciz-package.recipe';

// v4: Ön haciz ve AI değerleme
import FetchPriorLiensRecipes from './varlik/fetch-prior-liens.recipe';
import AIValuationRecipes from './varlik/ai-valuation.recipe';
import CalculateLienRankRecipes from './varlik/calculate-lien-rank.recipe';

const [FETCH_PRIOR_LIENS_VEHICLE, FETCH_PRIOR_LIENS_REAL_ESTATE] = FetchPriorLiensRecipes;
const [AI_VALUATION_VEHICLE, AI_VALUATION_REAL_ESTATE] = AIValuationRecipes;
const [CALCULATE_LIEN_RANK, ASSESS_PARTICIPATION_RISK] = CalculateLienRankRecipes;

// Haciz modülü
import { PREPARE_HACIZ_REQUESTS } from './haciz/prepare-haciz-requests.recipe';
import { PREPARE_BANK_SEIZURE } from './haciz/prepare-bank-seizure.recipe';
import { PREPARE_VEHICLE_SEIZURE } from './haciz/prepare-vehicle-seizure.recipe';
import { PREPARE_REAL_ESTATE_SEIZURE } from './haciz/prepare-real-estate-seizure.recipe';
import { PREPARE_WAGE_GARNISHMENT } from './haciz/prepare-wage-garnishment.recipe';
import { PREPARE_PENSION_GARNISHMENT } from './haciz/prepare-pension-garnishment.recipe';
import { UPDATE_HACIZ_STATUS } from './haciz/update-haciz-status.recipe';
import { TRACK_HACIZ_RESULTS } from './haciz/track-haciz-results.recipe';

// v5: Avans workflow
import YakalamaAvansRecipes from './haciz/request-yakalama-avansi.recipe';

const [
  REQUEST_YAKALAMA_AVANSI,
  WAIT_FOR_ADVANCE_PAYMENT,
  UNBLOCK_AFTER_PAYMENT,
  REQUIRE_ATTORNEY_DECISION,
] = YakalamaAvansRecipes;

// v6: Araç haciz koyma
import PlaceLienVehicleRecipes from './haciz/place-lien-vehicle.recipe';

const [
  COMPUTE_OUR_LIEN_RANK_VEHICLE,
  CHECK_PRIOR_LIENS_ACTIVE_VEHICLE,
  ANALYZE_IK100_PARTICIPATION_RISK,
  PLACE_LIEN_VEHICLE,
  DECIDE_YAKALAMA_AVANSI_FLOW,
] = PlaceLienVehicleRecipes;

// v7: Post-lien strateji ve pasif haciz temizliği
import PostLienStrategyRecipes from './haciz/post-lien-strategy.recipe';

const [
  DECIDE_POST_LIEN_STRATEGY_VEHICLE,
  PROPOSE_SALE_START_VEHICLE,
  DETECT_INACTIVE_PRIOR_LIENS_VEHICLE,
  PRUNE_INACTIVE_LIEN_FACTS,
  INFER_PRIOR_LIEN_AMOUNTS_HEURISTIC,
  REFRESH_RISK_AND_RECOVERY,
] = PostLienStrategyRecipes;

// v8: Ön haciz tutarı çıkarma ve satış başlatma
import SaleStartRecipes from './satis/sale-start-vehicle.recipe';

const [
  FETCH_PRIOR_LIEN_CASE_DETAILS,
  NORMALIZE_AUTHORITATIVE_LIEN_AMOUNT,
  START_SALE_VEHICLE,
  VERIFY_ADVANCE_RECEIPT,
] = SaleStartRecipes;

// v9: Satış sonrası akış ve borçlu davranış skoru
import PostSaleRecipes from './tahsilat/post-sale-flow.recipe';

const [
  MONITOR_SALE_TO_COMPLETION,
  SIMULATE_TAHSILAT_DISTRIBUTION_AFTER_SALE,
  MONITOR_TAHSILAT_AFTER_SALE,
  COMPUTE_DEBTOR_BEHAVIOR_SCORE,
] = PostSaleRecipes;

// v10: Uzlaşma ve anomali tespiti
import SettlementFlowRecipes from './tahsilat/settlement-flow.recipe';

const [
  COMPUTE_REAL_DISTRIBUTION,
  RUN_ANOMALY_DETECTION,
  PROPOSE_SETTLEMENT_OFFER,
  SEND_SETTLEMENT_OFFER,
] = SettlementFlowRecipes;

// v11: Taksit izleme
import InstallmentTrackingRecipes from './tahsilat/installment-tracking.recipe';

const [
  REGISTER_SETTLEMENT_ACCEPTANCE,
  MONITOR_INSTALLMENTS,
  SEND_INSTALLMENT_REMINDER,
  SEND_INSTALLMENT_WARNING,
  RETURN_TO_ENFORCEMENT,
] = InstallmentTrackingRecipes;

// v11: Haczedilmezlik riski ve MTS fork
import ExemptionRiskRecipes from './varlik/exemption-risk.recipe';

const [
  COMPUTE_EXEMPTION_RISK,
  FORK_CASE_FROM_MTS,
] = ExemptionRiskRecipes;

// Tahsilat modülü
import { SYNC_TAHSILAT } from './tahsilat/sync-tahsilat.recipe';
import { EVALUATE_CASE_CLOSURE } from './tahsilat/evaluate-case-closure.recipe';
import { TRACK_REDDIYAT } from './tahsilat/track-reddiyat.recipe';

// Satış modülü
import { START_SALE_WORKFLOW } from './satis/start-sale-workflow.recipe';
import { MONITOR_SALE_STATUS } from './satis/monitor-sale-status.recipe';

// Finans modülü
import { PREDICT_MASRAF_NEEDS } from './finance/predict-masraf-needs.recipe';

// Tüm recipe'leri export et
export const RECIPES: Recipe[] = [
  // Session modülü (1)
  ENSURE_UYAP_SESSION,
  
  // Senkronizasyon modülü (7)
  SYNC_SAFAHAT,
  INFER_STAGE_FROM_SIGNALS,
  BIND_CASE_TO_UYAP,
  SYNC_CASE_HEADER,
  SYNC_EVRAK_INDEX,
  CONSISTENCY_CHECK,
  ERROR_QUARANTINE,
  
  // Tebligat modülü - case-scoped (5)
  FETCH_ETEBLIGAT_STATUSES,
  COMPUTE_LEGAL_SERVICE_DATE,
  MAZBATA_SORGULA,
  FETCH_PHYSICAL_TEBLIGAT,
  OPEN_RETEBLIGAT_BRANCH,
  
  // Tebligat modülü - debtor-scoped (3)
  FETCH_ETEBLIGAT_DEBTOR,
  COMPUTE_SERVICE_DATE_DEBTOR,
  MAZBATA_SORGULA_DEBTOR,
  
  // Kesinleşme modülü (3)
  DETECT_FINALIZATION,
  MARK_AS_FINALIZED,
  DETECT_FINALIZATION_BY_ICRA_TYPE,
  
  // Varlık sorgu modülü (15 + 2 v11)
  RUN_ASSET_QUERIES,
  RUN_ASSET_QUERIES_DEBTOR,
  QUERY_SGK,
  QUERY_TAKBIS,
  QUERY_VEHICLE,
  QUERY_BANK_ACCOUNTS,
  QUERY_TRADE_REGISTRY,
  SCORE_ASSET_PROFILE,
  PROPOSE_HACIZ_PACKAGE,
  // v4: Ön haciz ve AI değerleme
  FETCH_PRIOR_LIENS_VEHICLE,
  FETCH_PRIOR_LIENS_REAL_ESTATE,
  AI_VALUATION_VEHICLE,
  AI_VALUATION_REAL_ESTATE,
  CALCULATE_LIEN_RANK,
  ASSESS_PARTICIPATION_RISK,
  // v11: Haczedilmezlik riski ve MTS fork
  COMPUTE_EXEMPTION_RISK,
  FORK_CASE_FROM_MTS,
  
  // Haciz modülü (12 + 5 v6 + 6 v7)
  PREPARE_HACIZ_REQUESTS,
  PREPARE_BANK_SEIZURE,
  PREPARE_VEHICLE_SEIZURE,
  PREPARE_REAL_ESTATE_SEIZURE,
  PREPARE_WAGE_GARNISHMENT,
  PREPARE_PENSION_GARNISHMENT,
  UPDATE_HACIZ_STATUS,
  TRACK_HACIZ_RESULTS,
  // v5: Avans workflow
  REQUEST_YAKALAMA_AVANSI,
  WAIT_FOR_ADVANCE_PAYMENT,
  UNBLOCK_AFTER_PAYMENT,
  REQUIRE_ATTORNEY_DECISION,
  // v6: Araç haciz koyma
  COMPUTE_OUR_LIEN_RANK_VEHICLE,
  CHECK_PRIOR_LIENS_ACTIVE_VEHICLE,
  ANALYZE_IK100_PARTICIPATION_RISK,
  PLACE_LIEN_VEHICLE,
  DECIDE_YAKALAMA_AVANSI_FLOW,
  // v7: Post-lien strateji
  DECIDE_POST_LIEN_STRATEGY_VEHICLE,
  PROPOSE_SALE_START_VEHICLE,
  DETECT_INACTIVE_PRIOR_LIENS_VEHICLE,
  PRUNE_INACTIVE_LIEN_FACTS,
  INFER_PRIOR_LIEN_AMOUNTS_HEURISTIC,
  REFRESH_RISK_AND_RECOVERY,
  
  // Tahsilat modülü (3 + 4 v9 + 4 v10 + 5 v11)
  SYNC_TAHSILAT,
  EVALUATE_CASE_CLOSURE,
  TRACK_REDDIYAT,
  // v9: Satış sonrası akış
  MONITOR_SALE_TO_COMPLETION,
  SIMULATE_TAHSILAT_DISTRIBUTION_AFTER_SALE,
  MONITOR_TAHSILAT_AFTER_SALE,
  COMPUTE_DEBTOR_BEHAVIOR_SCORE,
  // v10: Uzlaşma ve anomali
  COMPUTE_REAL_DISTRIBUTION,
  RUN_ANOMALY_DETECTION,
  PROPOSE_SETTLEMENT_OFFER,
  SEND_SETTLEMENT_OFFER,
  // v11: Taksit izleme
  REGISTER_SETTLEMENT_ACCEPTANCE,
  MONITOR_INSTALLMENTS,
  SEND_INSTALLMENT_REMINDER,
  SEND_INSTALLMENT_WARNING,
  RETURN_TO_ENFORCEMENT,
  
  // Satış modülü (2 + 4 v8)
  START_SALE_WORKFLOW,
  MONITOR_SALE_STATUS,
  // v8: Satış başlatma
  FETCH_PRIOR_LIEN_CASE_DETAILS,
  NORMALIZE_AUTHORITATIVE_LIEN_AMOUNT,
  START_SALE_VEHICLE,
  VERIFY_ADVANCE_RECEIPT,
  
  // Finans modülü (1)
  PREDICT_MASRAF_NEEDS,
];

// Recipe ID'ye göre hızlı erişim
export const RECIPE_MAP = new Map<string, Recipe>(
  RECIPES.map(r => [r.recipeId, r])
);

// Aşamaya göre recipe'leri getir
export function getRecipesByStage(stage: string): Recipe[] {
  return RECIPES.filter(r => r.stageTags.includes(stage as any));
}

// Aktif recipe'leri getir
export function getActiveRecipes(): Recipe[] {
  return RECIPES.filter(r => r.isActive);
}

// Onay gerektiren recipe'leri getir
export function getApprovalRequiredRecipes(): Recipe[] {
  return RECIPES.filter(r => r.requiresApproval);
}

// Debtor-scoped recipe'leri getir
export function getDebtorScopedRecipes(): Recipe[] {
  return RECIPES.filter(r => r.scope === 'debtor');
}

// Case-scoped recipe'leri getir
export function getCaseScopedRecipes(): Recipe[] {
  return RECIPES.filter(r => !r.scope || r.scope === 'case');
}

// Modüle göre recipe'leri getir
export function getRecipesByModule(module: string): Recipe[] {
  const moduleMap: Record<string, string[]> = {
    session: ['EnsureUYAPSession'],
    sync: [
      'SyncSafahatTimeline', 'InferStageFromSignals', 'BindCaseToUYAPNumber',
      'SyncCaseHeader', 'SyncEvrakIndex', 'ConsistencyCheck', 'ErrorQuarantine'
    ],
    tebligat: [
      'FetchEtebligatStatuses', 'ComputeLegalServiceDate', 'MazbataSorgulaIfMissing',
      'FetchPhysicalTebligatStatus', 'OpenReTebligatCaseBranch',
      'FetchPreparedETebligatlar_Debtor', 'ComputeServiceEffectiveDate_ETebligat_Debtor',
      'MazbataSorgula_ETebligat_Debtor'
    ],
    kesinlesme: ['DetectFinalizationCandidate', 'MarkAsFinalized', 'DetectFinalizationCandidate_ByIcraType'],
    varlik: [
      'RunAssetQueriesBatch', 'RunAssetQueries_Debtor', 'QuerySGK', 'QueryTakbis', 'QueryVehicle',
      'QueryBankAccounts', 'QueryTradeRegistry', 'ScoreAssetProfile_Debtor',
      'ProposeHacizPackage_Debtor',
      // v4
      'FetchPriorLiens_Vehicle', 'FetchPriorLiens_RealEstate',
      'AIValuation_Vehicle', 'AIValuation_RealEstate',
      'CalculateLienRank', 'AssessParticipationRisk',
      // v11
      'ComputeExemptionRisk', 'ForkCaseFromMTS'
    ],
    haciz: [
      'PrepareHacizRequests', 'PrepareBankSeizure', 'PrepareVehicleSeizure',
      'PrepareRealEstateSeizure', 'PrepareWageGarnishment', 'PreparePensionGarnishment',
      'UpdateHacizStatus', 'TrackHacizResults',
      // v5
      'RequestYakalamaAvansi_Communication', 'WaitForAdvancePayment',
      'UnblockAfterPayment', 'RequireAttorneyDecision',
      // v6
      'ComputeOurLienRank_Vehicle', 'CheckPriorLiensActive_Vehicle',
      'AnalyzeIK100ParticipationRisk', 'PlaceLien_Vehicle', 'DecideYakalamaAvansiFlow',
      // v7
      'DecidePostLienStrategy_Vehicle', 'ProposeSaleStart_Vehicle',
      'DetectInactivePriorLiens_Vehicle', 'PruneInactiveLienFacts',
      'InferPriorLienAmounts_Heuristic', 'RefreshRiskAndRecovery'
    ],
    tahsilat: [
      'SyncTahsilat', 'EvaluateCaseClosure', 'TrackReddiyat',
      // v9
      'MonitorSaleToCompletion', 'SimulateTahsilatDistributionAfterSale',
      'MonitorTahsilatAfterSale', 'ComputeDebtorBehaviorScore',
      // v10
      'ComputeRealDistribution', 'RunAnomalyDetection',
      'ProposeSettlementOffer', 'SendSettlementOffer',
      // v11
      'RegisterSettlementAcceptance', 'MonitorInstallments',
      'SendInstallmentReminder', 'SendInstallmentWarning', 'ReturnToEnforcement'
    ],
    satis: [
      'StartSaleWorkflow', 'MonitorSaleStatus',
      // v8
      'FetchPriorLienCaseDetails', 'NormalizeAuthoritativeLienAmount',
      'StartSale_Vehicle', 'VerifyAdvanceReceipt'
    ],
    finance: ['PredictNextMasrafNeeds'],
  };
  
  const recipeIds = moduleMap[module] || [];
  return RECIPES.filter(r => recipeIds.includes(r.recipeId));
}

// DAG bağımlılıklarına göre recipe'leri getir
export function getRecipesByDependency(emittedEvent: string): Recipe[] {
  return RECIPES.filter(r => r.guard?.includes(emittedEvent));
}

// Recipe istatistikleri
export const RECIPE_STATS = {
  total: RECIPES.length,
  active: RECIPES.filter(r => r.isActive).length,
  requiresApproval: RECIPES.filter(r => r.requiresApproval).length,
  debtorScoped: RECIPES.filter(r => r.scope === 'debtor').length,
  caseScoped: RECIPES.filter(r => !r.scope || r.scope === 'case').length,
  byModule: {
    session: 1,
    sync: 7,
    tebligat: 8,
    kesinlesme: 3,
    varlik: 17,  // v4 + v11 (exemption, fork)
    haciz: 23,   // +4 v5 avans + 5 v6 araç haciz + 6 v7 post-lien
    tahsilat: 16, // +4 v9 + 4 v10 + 5 v11
    satis: 6,    // +4 v8 satış başlatma
    finance: 1,
  },
};
