/**
 * TASK DAG CONFIG
 * 
 * v3: Görev bağımlılık grafiği (DAG).
 * task_dag_v3.yaml'dan alınmıştır.
 * 
 * Orchestrator bu DAG'i kullanarak "next-best-action" kuyruğunu oluşturur.
 */

import { DagNode, DagEdge, TaskDag } from '../types/recipe.types';

/**
 * DAG Nodes
 * Her düğüm bir recipe_id ile eşleşir.
 */
export const DAG_NODES: DagNode[] = [
  // Session
  {
    id: 'EnsureUYAPSession',
    type: 'recipe',
    emits: ['SESSION_OK'],
    guard: 'true',
  },

  // Sync
  {
    id: 'SyncSafahatTimeline',
    type: 'recipe',
    emits: ['SAFAHAT_SYNCED'],
    guard: 'SESSION_OK && case.uyapDosyaNo != null',
  },

  // Tebligat (Debtor-scoped)
  {
    id: 'FetchPreparedETebligatlar_Debtor',
    type: 'recipe',
    emits: ['ETEBLIGAT_SNAPSHOT'],
    guard: "case.stage == 'TEBLIGAT' && SESSION_OK && debtor.tebligatChannel in ['E_TEBLIGAT', 'KARMA']",
  },
  {
    id: 'FetchPhysicalTebligatStatus_Debtor',
    type: 'recipe',
    emits: ['PHYSICAL_TEBLIGAT_SNAPSHOT'],
    guard: "case.stage == 'TEBLIGAT' && SESSION_OK && debtor.tebligatChannel in ['FIZIKI', 'KARMA']",
  },
  {
    id: 'ComputeServiceEffectiveDate_ETebligat_Debtor',
    type: 'recipe',
    emits: ['SERVICE_EFFECTIVE_CANDIDATE'],
    guard: 'ETEBLIGAT_SNAPSHOT && debtor.eDeliveredDate != null',
  },
  {
    id: 'MazbataSorgula_ETebligat_Debtor',
    type: 'recipe',
    emits: ['MAZBATA_REQUESTED'],
    guard: 'SERVICE_EFFECTIVE_CANDIDATE && now() >= debtor.eDeliveredDate + params.tebligat.eTebligatDeemedDays && debtor.mazbataExists == false',
  },

  // Kesinleşme
  {
    id: 'DetectFinalizationCandidate_ByIcraType',
    type: 'recipe',
    emits: ['FINALIZATION_CANDIDATE'],
    guard: "case.stage in ['TEBLIGAT', 'KESINLESME'] && any(debtor.serviceEffectiveDate != null)",
  },
  {
    id: 'MarkFinalized',
    type: 'recipe',
    emits: ['FINALIZED'],
    guard: 'FINALIZATION_CANDIDATE && user.confirmed',
  },

  // Varlık (Debtor-scoped)
  {
    id: 'RunAssetQueries_Debtor',
    type: 'recipe',
    emits: ['ASSET_PROFILE_READY'],
    guard: "case.stage == 'VARLIK' && FINALIZED && SESSION_OK",
  },
  {
    id: 'ScoreAssetProfile_Debtor',
    type: 'recipe',
    emits: ['ASSET_SCORE'],
    guard: 'ASSET_PROFILE_READY',
  },
  {
    id: 'ProposeHacizPackage_Debtor',
    type: 'recipe',
    emits: ['HACIZ_RECOMMENDED'],
    guard: 'ASSET_SCORE >= params.varlik.scoreThresholdHigh',
  },

  // Haciz
  {
    id: 'PrepareHacizDocuments',
    type: 'recipe',
    emits: ['HACIZ_REQUESTED'],
    guard: 'HACIZ_RECOMMENDED && user.approved',
  },

  // Tahsilat
  {
    id: 'TrackTahsilat',
    type: 'recipe',
    emits: ['TAHSILAT_DELTA'],
    guard: 'SESSION_OK',
  },
  {
    id: 'TrackReddiyat',
    type: 'recipe',
    emits: ['REDDIYAT_DELTA'],
    guard: 'SESSION_OK',
  },
];

/**
 * DAG Edges
 * Bağımlılık ilişkileri.
 */
export const DAG_EDGES: DagEdge[] = [
  // Session → Sync
  { from: 'EnsureUYAPSession', to: 'SyncSafahatTimeline' },

  // Sync → Tebligat
  { from: 'SyncSafahatTimeline', to: 'FetchPreparedETebligatlar_Debtor' },
  { from: 'SyncSafahatTimeline', to: 'FetchPhysicalTebligatStatus_Debtor' },

  // E-Tebligat zinciri
  { from: 'FetchPreparedETebligatlar_Debtor', to: 'ComputeServiceEffectiveDate_ETebligat_Debtor' },
  { from: 'ComputeServiceEffectiveDate_ETebligat_Debtor', to: 'MazbataSorgula_ETebligat_Debtor' },
  { from: 'MazbataSorgula_ETebligat_Debtor', to: 'DetectFinalizationCandidate_ByIcraType' },

  // Kesinleşme → Varlık
  { from: 'DetectFinalizationCandidate_ByIcraType', to: 'MarkFinalized' },
  { from: 'MarkFinalized', to: 'RunAssetQueries_Debtor' },

  // Varlık → Haciz
  { from: 'RunAssetQueries_Debtor', to: 'ScoreAssetProfile_Debtor' },
  { from: 'ScoreAssetProfile_Debtor', to: 'ProposeHacizPackage_Debtor' },
  { from: 'ProposeHacizPackage_Debtor', to: 'PrepareHacizDocuments' },
];

/**
 * Task DAG
 */
export const TASK_DAG: TaskDag = {
  nodes: DAG_NODES,
  edges: DAG_EDGES,
};

/**
 * Node'un bağımlılıklarını getir
 */
export function getNodeDependencies(nodeId: string): string[] {
  return DAG_EDGES
    .filter(e => e.to === nodeId)
    .map(e => e.from);
}

/**
 * Node'un tetiklediği node'ları getir
 */
export function getNodeDependents(nodeId: string): string[] {
  return DAG_EDGES
    .filter(e => e.from === nodeId)
    .map(e => e.to);
}

/**
 * Node'un emit ettiği event'leri getir
 */
export function getNodeEmits(nodeId: string): string[] {
  const node = DAG_NODES.find(n => n.id === nodeId);
  return node?.emits || [];
}

/**
 * Node'un guard koşulunu getir
 */
export function getNodeGuard(nodeId: string): string {
  const node = DAG_NODES.find(n => n.id === nodeId);
  return node?.guard || 'true';
}

/**
 * Topological sort ile çalıştırma sırası
 */
export function getExecutionOrder(): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const deps = getNodeDependencies(nodeId);
    for (const dep of deps) {
      visit(dep);
    }

    result.push(nodeId);
  }

  for (const node of DAG_NODES) {
    visit(node.id);
  }

  return result;
}

/**
 * Belirli bir event'i emit eden node'ları bul
 */
export function findNodesEmitting(event: string): string[] {
  return DAG_NODES
    .filter(n => n.emits.includes(event))
    .map(n => n.id);
}

/**
 * Çalıştırılabilir node'ları bul (tüm bağımlılıkları tamamlanmış)
 */
export function findRunnableNodes(completedEvents: string[]): string[] {
  return DAG_NODES
    .filter(node => {
      // Guard'daki event'leri kontrol et
      const guardEvents = extractEventsFromGuard(node.guard);
      return guardEvents.every(e => completedEvents.includes(e) || e === 'true');
    })
    .map(n => n.id);
}

/**
 * Guard string'inden event'leri çıkar (basit parser)
 */
function extractEventsFromGuard(guard: string): string[] {
  const events: string[] = [];
  
  // SESSION_OK, SAFAHAT_SYNCED gibi büyük harfli event'leri bul
  const matches = guard.match(/[A-Z][A-Z_]+/g);
  if (matches) {
    events.push(...matches.filter(m => !['AND', 'OR', 'IN', 'TRUE', 'FALSE', 'NULL'].includes(m)));
  }
  
  return events;
}
