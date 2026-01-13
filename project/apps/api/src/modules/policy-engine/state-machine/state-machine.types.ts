/**
 * StateMachine Types
 * 
 * State flow tanımları ve transition tipleri.
 */

import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';

// Re-export StateInfo from types (single source of truth)
export { StateInfo } from '../types/policy-decision.interface';

/**
 * İcra Takip Türü
 */
export enum IcraType {
  ILAMSIZ_GENEL = 'ILAMSIZ_GENEL',
  ILAMSIZ_KAMBIYO = 'ILAMSIZ_KAMBIYO',
  ILAMLI = 'ILAMLI',
  NAFAKA = 'NAFAKA',
  KIRA = 'KIRA',
  REHIN = 'REHIN',
  IFLAS = 'IFLAS',
}

/**
 * Stage (Aşama) tanımı
 */
export interface StageDefinition {
  code: string;
  name: string;
  description?: string;
  isTerminal: boolean;
  allowedActions: ActionCode[];
  autoTransitions?: AutoTransition[];
}

/**
 * Otomatik transition tanımı
 */
export interface AutoTransition {
  condition: string; // Fact-based condition expression
  targetStage: string;
  delay?: number; // Milliseconds
}

/**
 * Transition tanımı
 */
export interface TransitionDefinition {
  fromStage: string;
  actionCode: ActionCode;
  toStage: string;
  conditions?: string[]; // Opsiyonel ek koşullar
}

/**
 * Compiled State Flow - Build time'da YAML'dan üretilir
 */
export interface CompiledStateFlow {
  icraType: IcraType;
  version: string;
  compiledAt: string;
  stages: Map<string, StageDefinition>;
  transitions: Map<string, Map<ActionCode, string>>; // fromStage → actionCode → toStage
}

/**
 * Transition Result
 */
export interface TransitionResult {
  allowed: boolean;
  reason: string;
  targetState?: string;
}

/**
 * Apply Transition Result
 */
export interface ApplyTransitionResult {
  success: boolean;
  code?: 'OK' | 'VERSION_MISMATCH' | 'INVALID_TRANSITION' | 'ERROR';
  newVersion?: number;
  previousState?: string;
  newState?: string;
  errorMessage?: string;
}

/**
 * Stage Requirement - Bir aşamaya geçiş için gerekli koşullar
 */
export interface StageRequirement {
  stageCode: string;
  requiredFacts: string[];
  requiredGates: string[];
  minDaysInPreviousStage?: number;
}
