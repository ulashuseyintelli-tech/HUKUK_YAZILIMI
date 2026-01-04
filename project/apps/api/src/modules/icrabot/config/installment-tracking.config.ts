/**
 * INSTALLMENT TRACKING CONFIG v11
 * 
 * Taksit izleme konfigürasyonu.
 * installment_tracking_v11.yaml'dan implement edilmiştir.
 * 
 * Amaç: Uzlaşma kabulü + taksit izleme + gecikme aksiyonu.
 */

// ==================== TYPES ====================

export type InstallmentPlanStatus = 
  | 'PROPOSED' 
  | 'SENT' 
  | 'ACCEPTED' 
  | 'ACTIVE' 
  | 'BREACHED' 
  | 'COMPLETED' 
  | 'CANCELLED';

export interface InstallmentParams {
  enabled: boolean;
  graceDays: number;
  reminderDaysBeforeDue: number;
  escalationDaysAfterDue: number;
}

export interface InstallmentScheduleEntry {
  installmentNo: number;
  dueDate: Date;
  amount: number;
  status: 'PENDING' | 'PAID' | 'MISSED' | 'PARTIAL';
  paidAmount: number;
  paidDate: Date | null;
}

export interface InstallmentPlan {
  id: string;
  debtorId: string;
  caseId: string;
  status: InstallmentPlanStatus;
  totalAmount: number;
  installmentCount: number;
  schedule: InstallmentScheduleEntry[];
  createdAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  breachedAt: Date | null;
}

export interface InstallmentStatusCheck {
  nextDue: InstallmentScheduleEntry | null;
  dueInDays: number | null;
  missedInstallments: number;
  daysPastDue: number;
  planBreached: boolean;
}

// ==================== CONFIG ====================

export const INSTALLMENT_PARAMS: InstallmentParams = {
  enabled: true,
  graceDays: 3,
  reminderDaysBeforeDue: 2,
  escalationDaysAfterDue: 7,
};

// ==================== SCHEDULE BUILDER ====================

/**
 * Taksit planı oluştur
 */
export function createInstallmentSchedule(
  totalAmount: number,
  installmentCount: number,
  startDate: Date,
  dueDay: number = 5
): InstallmentScheduleEntry[] {
  const schedule: InstallmentScheduleEntry[] = [];
  const installmentAmount = Math.ceil(totalAmount / installmentCount);
  
  let currentDate = new Date(startDate);
  
  for (let i = 1; i <= installmentCount; i++) {
    // Bir sonraki ayın dueDay'ine git
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, dueDay);
    
    // Son taksit için kalan tutarı hesapla
    const amount = i === installmentCount 
      ? totalAmount - (installmentAmount * (installmentCount - 1))
      : installmentAmount;
    
    schedule.push({
      installmentNo: i,
      dueDate: currentDate,
      amount,
      status: 'PENDING',
      paidAmount: 0,
      paidDate: null,
    });
  }
  
  return schedule;
}

// ==================== STATUS CHECKER ====================

/**
 * Taksit durumunu kontrol et
 */
export function checkInstallmentStatus(
  plan: InstallmentPlan,
  params: InstallmentParams = INSTALLMENT_PARAMS
): InstallmentStatusCheck {
  const now = new Date();
  
  // Bekleyen taksitleri bul
  const pendingInstallments = plan.schedule.filter(s => s.status === 'PENDING');
  const missedInstallments = plan.schedule.filter(s => s.status === 'MISSED');
  
  // Sonraki vadesi gelen taksit
  const nextDue = pendingInstallments
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] || null;
  
  // Vadeye kalan gün
  let dueInDays: number | null = null;
  if (nextDue) {
    dueInDays = Math.ceil(
      (nextDue.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }
  
  // Gecikmiş gün sayısı
  let daysPastDue = 0;
  const overdueInstallments = pendingInstallments.filter(s => s.dueDate < now);
  if (overdueInstallments.length > 0) {
    const oldestOverdue = overdueInstallments
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    daysPastDue = Math.ceil(
      (now.getTime() - oldestOverdue.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }
  
  // Plan ihlali kontrolü
  const planBreached = 
    missedInstallments.length >= 1 && 
    daysPastDue > params.escalationDaysAfterDue;
  
  return {
    nextDue,
    dueInDays,
    missedInstallments: missedInstallments.length,
    daysPastDue,
    planBreached,
  };
}

/**
 * Taksit ödemesini kaydet
 */
export function recordInstallmentPayment(
  plan: InstallmentPlan,
  installmentNo: number,
  paidAmount: number,
  paidDate: Date
): InstallmentPlan {
  const updatedSchedule = plan.schedule.map(entry => {
    if (entry.installmentNo === installmentNo) {
      const newPaidAmount = entry.paidAmount + paidAmount;
      const status = newPaidAmount >= entry.amount ? 'PAID' : 'PARTIAL';
      return {
        ...entry,
        paidAmount: newPaidAmount,
        paidDate,
        status,
      };
    }
    return entry;
  });
  
  // Tüm taksitler ödendi mi?
  const allPaid = updatedSchedule.every(s => s.status === 'PAID');
  
  return {
    ...plan,
    schedule: updatedSchedule,
    status: allPaid ? 'COMPLETED' : plan.status,
    completedAt: allPaid ? new Date() : null,
  };
}

/**
 * Taksiti kaçırıldı olarak işaretle
 */
export function markInstallmentMissed(
  plan: InstallmentPlan,
  installmentNo: number
): InstallmentPlan {
  const updatedSchedule = plan.schedule.map(entry => {
    if (entry.installmentNo === installmentNo && entry.status === 'PENDING') {
      return { ...entry, status: 'MISSED' as const };
    }
    return entry;
  });
  
  return {
    ...plan,
    schedule: updatedSchedule,
  };
}

/**
 * Planı ihlal edildi olarak işaretle
 */
export function markPlanBreached(plan: InstallmentPlan): InstallmentPlan {
  return {
    ...plan,
    status: 'BREACHED',
    breachedAt: new Date(),
  };
}
