/**
 * TAHSILAT DISTRIBUTION CONFIG v9
 * 
 * Tahsilat dağıtım simülatörü konfigürasyonu.
 * tahsilat_distribution_v9.yaml'dan implement edilmiştir.
 * 
 * Amaç: "Bu araç satılırsa bizim dosya ne kadar para görür?" sorusuna hızlı cevap.
 */

// ==================== TYPES ====================

export type LienType = 'haciz' | 'rehin' | 'tedbir';
export type ActiveStatus = 'active' | 'inactive' | 'unknown';

export interface LienInput {
  creditor: string;
  lienType: LienType;
  rankOrder: number | null;
  amountClaimed: number | null;
  activeStatus: ActiveStatus;
  isOurLien: boolean;
  lienDate?: Date;
}

export interface DistributionInput {
  assetFingerprint: string;
  salePriceExpected: number;
  saleCostsEstimated: number;
  liens: LienInput[];
  ourClaimAmount: number;
}

export interface AllocationResult {
  creditor: string;
  allocated: number;
  claimUsed: number;
  estimated: boolean;
}

export interface DistributionOutput {
  ourExpectedRecovery: number;
  allocations: AllocationResult[];
  residualPool: number;
  flags: {
    highUncertainty: boolean;
    lowExpectedRecovery: boolean;
  };
}

// ==================== CONFIG ====================

export const DISTRIBUTION_CONFIG = {
  uncertaintyPolicy: {
    unknownAmountFillRatio: 0.25,  // değer mid'in yüzdesi (fallback)
    unknownAmountConfidence: 0.35,
  },
  lienTypePriority: {
    rehin: 1,   // Rehin en önce
    haciz: 2,
    tedbir: 3,
  } as Record<LienType, number>,
  lowRecoveryThreshold: 5000, // TL
} as const;

// ==================== SIMULATOR ====================

/**
 * Tahsilat dağıtımını simüle et
 */
export function simulateTahsilatDistribution(input: DistributionInput): DistributionOutput {
  const { salePriceExpected, saleCostsEstimated, liens, ourClaimAmount } = input;
  
  // 1. Net havuz hesapla
  let netPool = Math.max(0, salePriceExpected - saleCostsEstimated);
  
  // 2. Aktif hacizleri filtrele ve sırala
  const activeLiens = liens.filter(l => 
    l.activeStatus === 'active' || l.activeStatus === 'unknown'
  );
  
  const sortedLiens = sortLiens(activeLiens);
  
  // 3. Dağıtım yap
  const allocations: AllocationResult[] = [];
  let ourExpectedRecovery = 0;
  let hasEstimatedAmounts = false;
  
  for (const lien of sortedLiens) {
    // Tutar belirle
    let claim: number;
    let estimated = false;
    
    if (lien.amountClaimed !== null) {
      claim = lien.amountClaimed;
    } else {
      // Bilinmeyen tutar için tahmin
      claim = salePriceExpected * DISTRIBUTION_CONFIG.uncertaintyPolicy.unknownAmountFillRatio;
      estimated = true;
      hasEstimatedAmounts = true;
    }
    
    // Tahsis et
    const allocated = Math.min(netPool, claim);
    netPool -= allocated;
    
    allocations.push({
      creditor: lien.creditor,
      allocated,
      claimUsed: claim,
      estimated,
    });
    
    // Bizim hacizimiz mi?
    if (lien.isOurLien) {
      ourExpectedRecovery = allocated;
    }
  }
  
  // 4. Bizim hacizimiz listede yoksa, kalan havuzdan tahsis et
  const ourLienInList = liens.some(l => l.isOurLien);
  if (!ourLienInList && netPool > 0) {
    ourExpectedRecovery = Math.min(netPool, ourClaimAmount);
    netPool -= ourExpectedRecovery;
    
    allocations.push({
      creditor: 'BİZİM DOSYAMIZ',
      allocated: ourExpectedRecovery,
      claimUsed: ourClaimAmount,
      estimated: false,
    });
  }
  
  // 5. Flags
  const flags = {
    highUncertainty: hasEstimatedAmounts,
    lowExpectedRecovery: ourExpectedRecovery < DISTRIBUTION_CONFIG.lowRecoveryThreshold,
  };
  
  return {
    ourExpectedRecovery,
    allocations,
    residualPool: netPool,
    flags,
  };
}

// ==================== HELPERS ====================

/**
 * Hacizleri sırala: rank_order ASC, lien_type_priority ASC, lien_date ASC
 */
function sortLiens(liens: LienInput[]): LienInput[] {
  return [...liens].sort((a, b) => {
    // 1. Rank order (null en sona)
    const rankA = a.rankOrder ?? 999;
    const rankB = b.rankOrder ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    
    // 2. Lien type priority
    const priorityA = DISTRIBUTION_CONFIG.lienTypePriority[a.lienType] ?? 99;
    const priorityB = DISTRIBUTION_CONFIG.lienTypePriority[b.lienType] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    
    // 3. Lien date (eski önce)
    const dateA = a.lienDate?.getTime() ?? 0;
    const dateB = b.lienDate?.getTime() ?? 0;
    return dateA - dateB;
  });
}

/**
 * Dağıtım sonucunu özet olarak formatla
 */
export function formatDistributionSummary(result: DistributionOutput): string {
  const lines: string[] = [];
  
  lines.push('=== TAHSİLAT DAĞITIM SİMÜLASYONU ===');
  lines.push('');
  
  for (const alloc of result.allocations) {
    const estimatedMark = alloc.estimated ? ' (tahmini)' : '';
    lines.push(`${alloc.creditor}: ${formatCurrency(alloc.allocated)}${estimatedMark}`);
  }
  
  lines.push('');
  lines.push(`Kalan Havuz: ${formatCurrency(result.residualPool)}`);
  lines.push(`BİZİM BEKLENEN TAHSİLAT: ${formatCurrency(result.ourExpectedRecovery)}`);
  
  if (result.flags.highUncertainty) {
    lines.push('⚠️ Yüksek belirsizlik: Bazı tutarlar tahminidir');
  }
  
  if (result.flags.lowExpectedRecovery) {
    lines.push('⚠️ Düşük beklenen tahsilat');
  }
  
  return lines.join('\n');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(amount);
}
