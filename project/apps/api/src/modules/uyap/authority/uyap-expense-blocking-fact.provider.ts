import { Injectable, Logger } from "@nestjs/common";
import { ComputedFactProvider } from "@/modules/policy-engine/fact-store/computed-fact-provider.interface";
import { ActionContext } from "@/modules/policy-engine/types";
import { FactMap, FactValue } from "@/modules/policy-engine/fact-store/fact-store.types";
import { ExpenseBlockReasonService } from "@/modules/expense-block-reason/expense-block-reason.service";

/** Bu provider'ın ürettiği fact anahtarları. */
export const UYAP_EXPENSE_BLOCKING_FACT_KEYS = {
  /** `EXPENSE_BLOCKING` gate'inin okuduğu canonical fact. */
  hasUnpaidBlockingExpense: "case.has_unpaid_blocking_expense",
  /** Ret/blok nedeni — yalnız decision-log/evidence içindir, gate koşulu DEĞİLDİR. */
  reason: "expense.blocking_reason",
} as const;

/**
 * `blockedActionCode` bu değere eşit olan AÇIK kayıt UYAP_SEND'i bloke eder.
 * Alan serbest string'tir (M-1 kararı: enum değil); canonical ActionCode adı kullanılır.
 */
export const UYAP_SEND_BLOCKING_ACTION_CODE = "UYAP_SEND";

/** Ödeme tarafında blok üretmeyen (kapanmış) masraf talebi statüleri. */
const NON_BLOCKING_EXPENSE_STATUSES = new Set(["PAID", "CANCELLED"]);

/**
 * UYAP-EXPENSE-BLOCKING-FACT-BRIDGE-I01 — `EXPENSE_BLOCKING` gate'inin canonical kaynağı.
 *
 * **ÖNCEKİ DURUM:** `case.has_unpaid_blocking_expense`, `case.expense_gate_blocked` adlı
 * bir fact'ten türüyordu; o fact'in repository'de HİÇBİR production writer'ı yoktu →
 * gate yapısal olarak ÖLÜYDÜ (her zaman fail-open). Artık değer canonical
 * `ExpenseBlockReason` kayıtlarından hesaplanır ve manuel flag authority DEĞİLDİR.
 *
 * **DEPENDENCY CYCLE YASAĞI (owner addendum):** bu provider `ExpenseGateService` veya
 * UYAP_SEND için tekrar CPE evaluation çalıştıran HİÇBİR servisi çağırmaz. İzin verilen
 * tek yol: side-effect-free, tenant-scoped `ExpenseBlockReasonService.findOpenBlocksForAction`.
 * Yasak zincir: `CPE UYAP_SEND → provider → ExpenseGateService → CPE UYAP_SEND`.
 *
 * **BLOKLAMA KURALI** (hepsi birlikte):
 * - aynı tenant + aynı case (sorgu düzeyinde zorunlu)
 * - `blockedActionCode === 'UYAP_SEND'` (explicit sınıflandırma)
 * - `status === OPEN` (şema: "işlem hâlâ bloklu"); `RESOLVED`/`CANCELLED` bloklamaz
 * - `createdAt <= evaluatedAt` (değerlendirme anında yürürlükte)
 * - bağlı masraf talebi varsa: açık tutar > 0 **ve** statü `PAID`/`CANCELLED` değil
 *
 * Sıradan (sınıflandırılmamış) ödenmemiş masraf tek başına **bloklamaz**.
 *
 * **FAIL-CLOSED:** bağlam eksik, okuma hatası, cross-tenant/cross-case kayıt veya
 * belirsiz veri → `true` (bloklu) döner. Provider **asla throw etmez**.
 */
@Injectable()
export class UyapExpenseBlockingFactProvider implements ComputedFactProvider {
  private readonly logger = new Logger(UyapExpenseBlockingFactProvider.name);

  readonly factKey = UYAP_EXPENSE_BLOCKING_FACT_KEYS.hasUnpaidBlockingExpense;
  readonly dependsOn: string[] = [];

  constructor(private readonly blockReasons: ExpenseBlockReasonService) {}

  async compute(caseId: string, context?: ActionContext, facts?: FactMap): Promise<FactValue> {
    const write = (value: FactValue, reason: string): FactValue => {
      facts?.set(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason, reason);
      return value;
    };

    try {
      const tenantId = context?.tenantId;
      if (!caseId || !tenantId) {
        // Tenant/case bağlamı olmadan masraf bloğu değerlendirilemez → fail-closed.
        return write(true, "EXPENSE_CONTEXT_INVALID");
      }

      const evaluatedAt =
        context?.evaluatedAt instanceof Date && !Number.isNaN(context.evaluatedAt.getTime())
          ? context.evaluatedAt
          : new Date();

      const openBlocks = await this.blockReasons.findOpenBlocksForAction(
        tenantId,
        caseId,
        UYAP_SEND_BLOCKING_ACTION_CODE,
        evaluatedAt,
      );

      if (!openBlocks || openBlocks.length === 0) {
        // Explicit UYAP_SEND sınıflandırması yok → sıradan masraflar bloklamaz.
        return write(false, "NO_EXPLICIT_BLOCKING_CLASSIFICATION");
      }

      for (const block of openBlocks) {
        // Savunmacı tenant/case doğrulaması (sorgu zaten kısıtlı; veri bozulması sessiz geçmesin).
        if (block.tenantId !== tenantId || block.caseId !== caseId) {
          return write(true, "EXPENSE_BLOCK_TENANT_OR_CASE_MISMATCH");
        }

        const expense = block.expenseRequest;
        if (!expense) {
          // Bağlı masraf talebi yok: AÇIK sınıflandırma kaydının kendisi bloklar.
          return write(true, "OPEN_BLOCKING_CLASSIFICATION");
        }

        if (expense.tenantId !== tenantId || expense.caseId !== caseId) {
          return write(true, "EXPENSE_TENANT_OR_CASE_MISMATCH");
        }

        const status = String(expense.status);
        if (NON_BLOCKING_EXPENSE_STATUSES.has(status)) {
          continue; // ödenmiş/iptal → bu kayıt bloklamaz
        }

        const total = Number(expense.totalAmount);
        const paid = Number(expense.paidTotal ?? 0);
        if (!Number.isFinite(total) || !Number.isFinite(paid)) {
          return write(true, "EXPENSE_AMOUNT_AMBIGUOUS");
        }
        if (total - paid > 0) {
          return write(true, "UNPAID_BLOCKING_EXPENSE");
        }
        // Tam ödenmiş: blok üretmez (kayıt RESOLVED'a çekilmemiş olabilir).
      }

      return write(false, "ALL_BLOCKING_EXPENSES_SETTLED");
    } catch (error: any) {
      // Okuma hatası authority üretemez → fail-closed (bloklu). Ham hata/PII loglanmaz.
      this.logger.error(`Masraf blok fact'i hesaplanamadi: ${error?.name ?? "error"}`);
      return write(true, "EXPENSE_PROVIDER_FAILURE");
    }
  }
}
