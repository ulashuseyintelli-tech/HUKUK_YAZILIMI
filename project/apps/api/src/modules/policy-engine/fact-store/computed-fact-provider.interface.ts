import { ActionContext } from '../types';
import { FactMap, FactValue } from './fact-store.types';

/**
 * ComputedFactProvider Interface
 * 
 * Computed fact'ler için provider interface.
 * Her provider bir fact key'i hesaplar ve bağımlılıklarını bildirir.
 * 
 * Dependency resolution: Topological sort ile bağımlılık sırası belirlenir.
 * Cycle detection: Döngüsel bağımlılıklar registration sırasında tespit edilir.
 */
export interface ComputedFactProvider {
  /**
   * Bu provider'ın hesapladığı fact key.
   * Wildcard destekler: "debtor.*.days_since_notification"
   */
  readonly factKey: string;

  /**
   * Bu provider'ın bağımlı olduğu fact key'leri.
   * Wildcard destekler.
   */
  readonly dependsOn: string[];

  /**
   * Fact değerini hesaplar.
   * 
   * @param caseId Dosya ID
   * @param context Opsiyonel context
   * @param facts Mevcut fact'ler (bağımlılıklar dahil)
   * @returns Hesaplanan değer
   */
  compute(
    caseId: string,
    context?: ActionContext,
    facts?: FactMap,
  ): Promise<FactValue>;
}

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  provider: ComputedFactProvider;
  order: number; // Topological sort order
}
