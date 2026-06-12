/**
 * @CpeRequired Decorator
 * 
 * Controller endpoint'lerine CPE kontrolü ekler.
 * Aksiyon yapılmadan önce CPE.canPerformAction çağrılmasını zorunlu kılar.
 * 
 * Usage:
 * @CpeRequired(ActionCode.UYAP_SEND)
 * @CpeRequired(ActionCode.TRIGGER_HACIZ, (req) => ({ debtorId: req.params.debtorId }))
 * 
 * @see design.md - @CpeRequired Decorator and Interceptor
 */

import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ActionCode } from '../types/action-code.enum';
import { ActionContext } from '../types/policy-decision.interface';

/**
 * Scope resolver function type
 * Request'ten ActionContext çıkarır
 */
export type ScopeResolverFn = (req: any) => ActionContext | undefined;

/**
 * Metadata keys
 */
export const CPE_ACTION_CODE_KEY = 'cpe:actionCode';
export const CPE_SCOPE_RESOLVER_KEY = 'cpe:scopeResolver';
export const CPE_CASE_ID_RESOLVER_KEY = 'cpe:caseIdResolver';
/** P1b: caseId'yi expense ':id' param'ından tenant-scoped çöz (guard'da async lookup) */
export const CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY = 'cpe:caseIdFromExpenseParam';

/**
 * @CpeRequired opsiyonları
 */
export interface CpeRequiredOptions {
  /**
   * caseId, route ':id' (expense request id) üzerinden tenant-scoped çözülsün mü?
   * true ise guard, prisma.expenseRequest'ten (id + req.user.tenantId) caseId türetir;
   * bulunamazsa fail-closed 403. Route/body kontratı DEĞİŞMEZ.
   */
  caseIdFromExpenseParam?: boolean;
}

/**
 * Case ID resolver function type
 * Request'ten caseId çıkarır (senkron). Async/DB lookup gereken durum (expense->case)
 * resolver fonksiyonu ile değil, guard'daki caseIdFromExpenseParam stratejisiyle yapılır.
 */
export type CaseIdResolverFn = (req: any) => string;

/**
 * Default case ID resolver
 * req.params.caseId veya req.body.caseId'den alır
 */
export const defaultCaseIdResolver: CaseIdResolverFn = (req: any): string => {
  return req.params?.caseId || req.body?.caseId || req.query?.caseId;
};

/**
 * @CpeRequired Decorator
 * 
 * @param actionCode - Kontrol edilecek aksiyon kodu
 * @param scopeResolverOrOptions - Scope resolver (fonksiyon) VEYA opsiyon objesi (CpeRequiredOptions)
 * @param caseIdResolver - Opsiyonel case ID resolver (varsayılan: params/body'den)
 *
 * Geriye dönük uyumlu: 2. parametre fonksiyon ise scopeResolver gibi davranır;
 * obje ise opsiyon olarak değerlendirilir.
 */
export function CpeRequired(
  actionCode: ActionCode,
  scopeResolverOrOptions?: ScopeResolverFn | CpeRequiredOptions,
  caseIdResolver?: CaseIdResolverFn,
) {
  const isOptions =
    typeof scopeResolverOrOptions === 'object' && scopeResolverOrOptions !== null;
  const scopeResolver = isOptions
    ? undefined
    : (scopeResolverOrOptions as ScopeResolverFn | undefined);
  const options = isOptions ? (scopeResolverOrOptions as CpeRequiredOptions) : undefined;

  return applyDecorators(
    SetMetadata(CPE_ACTION_CODE_KEY, actionCode),
    SetMetadata(CPE_SCOPE_RESOLVER_KEY, scopeResolver),
    SetMetadata(CPE_CASE_ID_RESOLVER_KEY, caseIdResolver || defaultCaseIdResolver),
    SetMetadata(CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY, options?.caseIdFromExpenseParam ?? false),
  );
}

/**
 * Common scope resolvers
 */
export const ScopeResolvers = {
  /**
   * Debtor scope - debtorId from params
   */
  fromDebtorParam: (req: any): ActionContext | undefined => {
    const debtorId = req.params?.debtorId;
    return debtorId ? { debtorId } : undefined;
  },

  /**
   * Asset scope - assetId from params
   */
  fromAssetParam: (req: any): ActionContext | undefined => {
    const assetId = req.params?.assetId;
    return assetId ? { assetId } : undefined;
  },

  /**
   * Expense scope - expenseId from params
   */
  fromExpenseParam: (req: any): ActionContext | undefined => {
    const expenseId = req.params?.expenseId;
    return expenseId ? { expenseId } : undefined;
  },

  /**
   * From body - debtorId, assetId, expenseId from request body
   */
  fromBody: (req: any): ActionContext | undefined => {
    const { debtorId, assetId, expenseId } = req.body || {};
    if (debtorId || assetId || expenseId) {
      return { debtorId, assetId, expenseId };
    }
    return undefined;
  },

  /**
   * Combined - try params first, then body
   */
  combined: (req: any): ActionContext | undefined => {
    const debtorId = req.params?.debtorId || req.body?.debtorId;
    const assetId = req.params?.assetId || req.body?.assetId;
    const expenseId = req.params?.expenseId || req.body?.expenseId;
    
    if (debtorId || assetId || expenseId) {
      return { debtorId, assetId, expenseId };
    }
    return undefined;
  },
};
