/**
 * Compiled State Flows
 * 
 * Bu dosya build-time'da YAML'dan otomatik üretilir.
 * MANUEL DÜZENLEME YAPMAYIN!
 * 
 * Üretim: npm run compile:rules
 * Kaynak: config/rules/stage_flows_v3.yaml
 * 
 * @generated
 */

import { ActionCode } from '../../types/action-code.enum';
import { IcraType, CompiledStateFlow, StageDefinition } from '../state-machine.types';

// Version hash - YAML içeriğinden üretilir
export const RULE_VERSION = 'v1.0.0-compiled-2026-01-13';
export const COMPILED_AT = '2026-01-13T00:00:00.000Z';

/**
 * İlamsız Genel Haciz - Stage Definitions
 */
const ILAMSIZ_GENEL_STAGES: Map<string, StageDefinition> = new Map([
  ['INITIAL', {
    code: 'INITIAL',
    name: 'Dosya Açıldı',
    description: 'Takip dosyası oluşturuldu',
    isTerminal: false,
    allowedActions: [
      ActionCode.REQUEST_EXPENSE,
      ActionCode.UYAP_SEND,
    ],
  }],
  ['UYAP_SENT', {
    code: 'UYAP_SENT',
    name: 'UYAP\'a Gönderildi',
    description: 'Takip talebi UYAP\'a iletildi',
    isTerminal: false,
    allowedActions: [
      ActionCode.UYAP_QUERY,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['PAYMENT_ORDER_SENT', {
    code: 'PAYMENT_ORDER_SENT',
    name: 'Ödeme Emri Gönderildi',
    description: 'Borçluya ödeme emri tebliğe çıkarıldı',
    isTerminal: false,
    allowedActions: [
      ActionCode.UYAP_QUERY,
      ActionCode.SEND_DEBTOR_MSG,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['NOTIFICATION_DELIVERED', {
    code: 'NOTIFICATION_DELIVERED',
    name: 'Tebligat Yapıldı',
    description: 'Ödeme emri borçluya tebliğ edildi',
    isTerminal: false,
    allowedActions: [
      ActionCode.QUERY_ASSETS,
      ActionCode.QUERY_BANK_ACCOUNTS,
      ActionCode.QUERY_VEHICLES,
      ActionCode.REQUEST_ENFORCEMENT,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['WAITING_OBJECTION_PERIOD', {
    code: 'WAITING_OBJECTION_PERIOD',
    name: 'İtiraz Süresi Bekleniyor',
    description: '7 günlük itiraz süresi',
    isTerminal: false,
    allowedActions: [
      ActionCode.UYAP_QUERY,
      ActionCode.QUERY_ASSETS,
    ],
  }],
  ['ENFORCEMENT_REQUESTED', {
    code: 'ENFORCEMENT_REQUESTED',
    name: 'Haciz Talep Edildi',
    description: 'Haciz talebi yapıldı',
    isTerminal: false,
    allowedActions: [
      ActionCode.TRIGGER_HACIZ,
      ActionCode.UYAP_QUERY,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['HACIZ_APPLIED', {
    code: 'HACIZ_APPLIED',
    name: 'Haciz Uygulandı',
    description: 'Haciz işlemi gerçekleştirildi',
    isTerminal: false,
    allowedActions: [
      ActionCode.REQUEST_SALE,
      ActionCode.UYAP_QUERY,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['SALE_REQUESTED', {
    code: 'SALE_REQUESTED',
    name: 'Satış Talep Edildi',
    description: 'Hacizli malların satışı talep edildi',
    isTerminal: false,
    allowedActions: [
      ActionCode.UYAP_QUERY,
      ActionCode.REQUEST_EXPENSE,
    ],
  }],
  ['COLLECTION_PENDING', {
    code: 'COLLECTION_PENDING',
    name: 'Tahsilat Bekleniyor',
    description: 'Tahsilat işlemi bekleniyor',
    isTerminal: false,
    allowedActions: [
      ActionCode.RECORD_COLLECTION,
      ActionCode.UYAP_QUERY,
    ],
  }],
  ['CLOSED_PAID', {
    code: 'CLOSED_PAID',
    name: 'Kapatıldı - Tahsil Edildi',
    description: 'Alacak tamamen tahsil edildi',
    isTerminal: true,
    allowedActions: [
      ActionCode.REOPEN_CASE,
    ],
  }],
  ['CLOSED_SETTLED', {
    code: 'CLOSED_SETTLED',
    name: 'Kapatıldı - Sulh',
    description: 'Taraflar sulh oldu',
    isTerminal: true,
    allowedActions: [
      ActionCode.REOPEN_CASE,
    ],
  }],
  ['CLOSED_WITHDRAWN', {
    code: 'CLOSED_WITHDRAWN',
    name: 'Kapatıldı - Feragat',
    description: 'Alacaklı takipten vazgeçti',
    isTerminal: true,
    allowedActions: [
      ActionCode.REOPEN_CASE,
    ],
  }],
  ['ARCHIVED', {
    code: 'ARCHIVED',
    name: 'Arşivlendi',
    description: 'Dosya arşive kaldırıldı',
    isTerminal: true,
    allowedActions: [
      ActionCode.REOPEN_CASE,
    ],
  }],
]);

/**
 * İlamsız Genel Haciz - Transitions
 */
const ILAMSIZ_GENEL_TRANSITIONS = new Map<string, Map<ActionCode, string>>([
  ['INITIAL', new Map<ActionCode, string>([
    [ActionCode.UYAP_SEND, 'UYAP_SENT'],
  ])],
  ['UYAP_SENT', new Map<ActionCode, string>([
    [ActionCode.SEND_PAYMENT_ORDER, 'PAYMENT_ORDER_SENT'],
  ])],
  ['PAYMENT_ORDER_SENT', new Map<ActionCode, string>([
    [ActionCode.SEND_NOTIFICATION, 'NOTIFICATION_DELIVERED'],
  ])],
  ['NOTIFICATION_DELIVERED', new Map<ActionCode, string>([
    [ActionCode.REQUEST_ENFORCEMENT, 'ENFORCEMENT_REQUESTED'],
    [ActionCode.PROCEED_TO_ENFORCEMENT, 'ENFORCEMENT_REQUESTED'],
  ])],
  ['WAITING_OBJECTION_PERIOD', new Map<ActionCode, string>([
    [ActionCode.REQUEST_ENFORCEMENT, 'ENFORCEMENT_REQUESTED'],
  ])],
  ['ENFORCEMENT_REQUESTED', new Map<ActionCode, string>([
    [ActionCode.TRIGGER_HACIZ, 'HACIZ_APPLIED'],
  ])],
  ['HACIZ_APPLIED', new Map<ActionCode, string>([
    [ActionCode.REQUEST_SALE, 'SALE_REQUESTED'],
    [ActionCode.RECORD_COLLECTION, 'COLLECTION_PENDING'],
  ])],
  ['SALE_REQUESTED', new Map<ActionCode, string>([
    [ActionCode.RECORD_COLLECTION, 'COLLECTION_PENDING'],
  ])],
  ['COLLECTION_PENDING', new Map<ActionCode, string>([
    [ActionCode.FINALIZE_CASE, 'CLOSED_PAID'],
  ])],
  // Terminal states - only REOPEN allowed
  ['CLOSED_PAID', new Map<ActionCode, string>([
    [ActionCode.REOPEN_CASE, 'INITIAL'],
  ])],
  ['CLOSED_SETTLED', new Map<ActionCode, string>([
    [ActionCode.REOPEN_CASE, 'INITIAL'],
  ])],
  ['CLOSED_WITHDRAWN', new Map<ActionCode, string>([
    [ActionCode.REOPEN_CASE, 'INITIAL'],
  ])],
  ['ARCHIVED', new Map<ActionCode, string>([
    [ActionCode.REOPEN_CASE, 'INITIAL'],
  ])],
]);

/**
 * İlamsız Kambiyo - Stage Definitions (Simplified)
 */
const ILAMSIZ_KAMBIYO_STAGES: Map<string, StageDefinition> = new Map([
  ['INITIAL', {
    code: 'INITIAL',
    name: 'Dosya Açıldı',
    isTerminal: false,
    allowedActions: [ActionCode.REQUEST_EXPENSE, ActionCode.UYAP_SEND],
  }],
  ['UYAP_SENT', {
    code: 'UYAP_SENT',
    name: 'UYAP\'a Gönderildi',
    isTerminal: false,
    allowedActions: [ActionCode.UYAP_QUERY, ActionCode.REQUEST_EXPENSE],
  }],
  ['PAYMENT_ORDER_SENT', {
    code: 'PAYMENT_ORDER_SENT',
    name: 'Ödeme Emri Gönderildi',
    isTerminal: false,
    allowedActions: [ActionCode.UYAP_QUERY, ActionCode.SEND_DEBTOR_MSG],
  }],
  ['NOTIFICATION_DELIVERED', {
    code: 'NOTIFICATION_DELIVERED',
    name: 'Tebligat Yapıldı',
    isTerminal: false,
    allowedActions: [ActionCode.QUERY_ASSETS, ActionCode.REQUEST_ENFORCEMENT],
  }],
  ['ENFORCEMENT_REQUESTED', {
    code: 'ENFORCEMENT_REQUESTED',
    name: 'Haciz Talep Edildi',
    isTerminal: false,
    allowedActions: [ActionCode.TRIGGER_HACIZ],
  }],
  ['HACIZ_APPLIED', {
    code: 'HACIZ_APPLIED',
    name: 'Haciz Uygulandı',
    isTerminal: false,
    allowedActions: [ActionCode.REQUEST_SALE, ActionCode.RECORD_COLLECTION],
  }],
  ['CLOSED_PAID', {
    code: 'CLOSED_PAID',
    name: 'Kapatıldı',
    isTerminal: true,
    allowedActions: [ActionCode.REOPEN_CASE],
  }],
]);

const ILAMSIZ_KAMBIYO_TRANSITIONS = new Map<string, Map<ActionCode, string>>([
  ['INITIAL', new Map<ActionCode, string>([[ActionCode.UYAP_SEND, 'UYAP_SENT']])],
  ['UYAP_SENT', new Map<ActionCode, string>([[ActionCode.SEND_PAYMENT_ORDER, 'PAYMENT_ORDER_SENT']])],
  ['PAYMENT_ORDER_SENT', new Map<ActionCode, string>([[ActionCode.SEND_NOTIFICATION, 'NOTIFICATION_DELIVERED']])],
  ['NOTIFICATION_DELIVERED', new Map<ActionCode, string>([[ActionCode.REQUEST_ENFORCEMENT, 'ENFORCEMENT_REQUESTED']])],
  ['ENFORCEMENT_REQUESTED', new Map<ActionCode, string>([[ActionCode.TRIGGER_HACIZ, 'HACIZ_APPLIED']])],
  ['HACIZ_APPLIED', new Map<ActionCode, string>([
    [ActionCode.REQUEST_SALE, 'SALE_REQUESTED'],
    [ActionCode.FINALIZE_CASE, 'CLOSED_PAID'],
  ])],
  ['CLOSED_PAID', new Map<ActionCode, string>([[ActionCode.REOPEN_CASE, 'INITIAL']])],
]);

/**
 * Compiled State Flows Map
 */
export const COMPILED_STATE_FLOWS: Map<IcraType, CompiledStateFlow> = new Map([
  [IcraType.ILAMSIZ_GENEL, {
    icraType: IcraType.ILAMSIZ_GENEL,
    version: RULE_VERSION,
    compiledAt: COMPILED_AT,
    stages: ILAMSIZ_GENEL_STAGES,
    transitions: ILAMSIZ_GENEL_TRANSITIONS,
  }],
  [IcraType.ILAMSIZ_KAMBIYO, {
    icraType: IcraType.ILAMSIZ_KAMBIYO,
    version: RULE_VERSION,
    compiledAt: COMPILED_AT,
    stages: ILAMSIZ_KAMBIYO_STAGES,
    transitions: ILAMSIZ_KAMBIYO_TRANSITIONS,
  }],
  // TODO: Add other icra types (ILAMLI, NAFAKA, KIRA, REHIN, IFLAS)
]);

/**
 * Default state flow (fallback)
 */
export const DEFAULT_STATE_FLOW = COMPILED_STATE_FLOWS.get(IcraType.ILAMSIZ_GENEL)!;

/**
 * Get state flow by icra type
 */
export function getStateFlow(icraType: IcraType): CompiledStateFlow {
  return COMPILED_STATE_FLOWS.get(icraType) || DEFAULT_STATE_FLOW;
}

/**
 * Get all valid stages for an icra type
 */
export function getValidStages(icraType: IcraType): string[] {
  const flow = getStateFlow(icraType);
  return Array.from(flow.stages.keys());
}

/**
 * Check if a stage is terminal
 */
export function isTerminalStage(icraType: IcraType, stageCode: string): boolean {
  const flow = getStateFlow(icraType);
  const stage = flow.stages.get(stageCode);
  return stage?.isTerminal ?? false;
}
