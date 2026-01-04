import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { 
  Recipe, 
  Precondition, 
  DecisionRule, 
  NextBestAction,
  CaseDigitalTwin,
  StageTag,
} from './types/recipe.types';
import { RECIPES, RECIPE_MAP, getRecipesByStage, getActiveRecipes } from './recipes';

/**
 * RECIPE SERVICE
 * 
 * "Eğitilebilir Bot" için kural motoru.
 * Recipe'leri değerlendirir ve Next Best Action listesi üretir.
 */
@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Tüm recipe'leri getir
   */
  getAllRecipes(): Recipe[] {
    return RECIPES;
  }

  /**
   * Recipe ID'ye göre getir
   */
  getRecipeById(recipeId: string): Recipe | undefined {
    return RECIPE_MAP.get(recipeId);
  }

  /**
   * Aşamaya göre recipe'leri getir
   */
  getRecipesForStage(stage: StageTag): Recipe[] {
    return getRecipesByStage(stage);
  }

  /**
   * Dosya için dijital ikiz oluştur
   */
  async buildDigitalTwin(caseId: string): Promise<CaseDigitalTwin> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        tebligatlar: {
          where: { status: { in: ['GONDERILDI', 'TESLIM_EDILDI'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        debtors: {
          include: {
            debtor: {
              include: { assets: true },
            },
          },
        },
        collections: true,
        lifecycleEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!caseData) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // Aşama mapping
    const stageMap: Record<string, StageTag> = {
      'INITIAL': 'ACILIS',
      'PAYMENT_ORDER': 'TEBLIGAT',
      'WAITING_RESPONSE': 'TEBLIGAT',
      'ENFORCEMENT': 'KESINLESME',
      'SEIZURE': 'HACIZ',
      'PARTIAL_PAYMENT': 'TAHSILAT',
      'FULL_PAYMENT': 'KAPANIS',
      'SALE_REQUEST': 'SATIS',
      'OBJECTION': 'TEBLIGAT',
    };

    const lastTebligat = caseData.tebligatlar[0];
    const hasAssets = caseData.debtors.some(cd => cd.debtor.assets.length > 0);

    return {
      caseId: caseData.id,
      tenantId: caseData.tenantId,
      uyapDosyaNo: caseData.executionFileNumber || undefined,
      uyapBirimKodu: caseData.uyapBirimKodu || undefined,
      stage: stageMap[caseData.workflowStage] || 'ACILIS',
      lastSyncAt: caseData.updatedAt,
      nextActions: [], // Aşağıda doldurulacak
      evidence: {
        tebligTarihi: lastTebligat?.deliveredAt || undefined,
      },
      tebligatStatus: lastTebligat ? {
        type: lastTebligat.channel === 'E_TEBLIGAT' ? 'E_TEBLIGAT' : 'PTT',
        sentAt: lastTebligat.sentAt || undefined,
        deliveredAt: lastTebligat.deliveredAt || undefined,
        mazbataExists: !!lastTebligat.mazbataNo,
      } : undefined,
      finalization: {
        isCandidate: caseData.workflowStage === 'WAITING_RESPONSE',
        isFinalized: caseData.workflowStage === 'ENFORCEMENT',
      },
      assetProfile: {
        hasAssets,
        assetTypes: caseData.debtors.flatMap(cd => 
          cd.debtor.assets.map(a => a.type)
        ),
      },
    };
  }

  /**
   * Dosya için Next Best Actions hesapla
   */
  async calculateNextBestActions(caseId: string): Promise<NextBestAction[]> {
    const twin = await this.buildDigitalTwin(caseId);
    const actions: NextBestAction[] = [];

    // Aktif recipe'leri değerlendir
    const activeRecipes = getActiveRecipes();

    for (const recipe of activeRecipes) {
      // Aşama kontrolü
      if (!recipe.stageTags.includes(twin.stage)) {
        continue;
      }

      // Ön koşulları değerlendir
      const preconditionsMet = await this.evaluatePreconditions(
        recipe.preconditions,
        twin,
        caseId
      );

      if (preconditionsMet) {
        actions.push({
          caseId,
          recipeId: recipe.recipeId,
          recipeName: recipe.name,
          priority: recipe.priority || 'MEDIUM',
          reason: this.generateReason(recipe, twin),
          requiresApproval: recipe.requiresApproval || false,
          canAutoExecute: !recipe.requiresApproval && twin.stage !== 'KAPANIS',
        });
      }
    }

    // Önceliğe göre sırala
    return actions.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Ön koşulları değerlendir
   */
  private async evaluatePreconditions(
    preconditions: Precondition[],
    twin: CaseDigitalTwin,
    caseId: string
  ): Promise<boolean> {
    for (const condition of preconditions) {
      const value = this.getFieldValue(condition.field, twin);
      
      if (!this.evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Alan değerini al (nested path destekli)
   */
  private getFieldValue(field: string, obj: any): any {
    const parts = field.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    
    return value;
  }

  /**
   * Koşulu değerlendir
   */
  private evaluateCondition(
    value: any,
    operator: Precondition['operator'],
    expected?: any
  ): boolean {
    switch (operator) {
      case 'eq': return value === expected;
      case 'neq': return value !== expected;
      case 'gt': return value > expected;
      case 'lt': return value < expected;
      case 'gte': return value >= expected;
      case 'lte': return value <= expected;
      case 'in': return Array.isArray(expected) && expected.includes(value);
      case 'notIn': return Array.isArray(expected) && !expected.includes(value);
      case 'isNull': return value === null || value === undefined;
      case 'isNotNull': return value !== null && value !== undefined;
      default: return false;
    }
  }

  /**
   * Aksiyon nedeni oluştur
   */
  private generateReason(recipe: Recipe, twin: CaseDigitalTwin): string {
    const reasons: Record<string, string> = {
      'FetchEtebligatStatuses': 'E-tebligat durumu kontrol edilmeli',
      'ComputeLegalServiceDate': 'Tebliğ tarihi hesaplanmalı',
      'MazbataSorgulaIfMissing': 'E-tebligat mazbatası sorgulanmalı',
      'DetectFinalizationCandidate': 'Kesinleşme durumu kontrol edilmeli',
      'RunAssetQueriesBatch': 'Varlık sorguları çalıştırılmalı',
      'SyncSafahatTimeline': 'Safahat senkronize edilmeli',
    };

    return reasons[recipe.recipeId] || recipe.description || recipe.name;
  }

  /**
   * Karar kurallarını değerlendir
   */
  async evaluateDecisions(
    recipe: Recipe,
    context: Record<string, any>
  ): Promise<{
    tasksToEnqueue: string[];
    updates: Record<string, any>;
    actions: string[];
  }> {
    const result = {
      tasksToEnqueue: [] as string[],
      updates: {} as Record<string, any>,
      actions: [] as string[],
    };

    for (const decision of recipe.decisions) {
      // Basit koşul değerlendirme (gerçek implementasyonda expression parser kullanılmalı)
      const conditionMet = this.evaluateSimpleCondition(decision.if, context);

      if (conditionMet) {
        if (decision.thenEnqueue) {
          result.tasksToEnqueue.push(...decision.thenEnqueue);
        }
        if (decision.thenUpdate) {
          Object.assign(result.updates, decision.thenUpdate);
        }
        if (decision.thenAction) {
          result.actions.push(decision.thenAction);
        }
      }
    }

    return result;
  }

  /**
   * Basit koşul değerlendirme
   * Format: "field == value" veya "field != null"
   */
  private evaluateSimpleCondition(condition: string, context: Record<string, any>): boolean {
    try {
      // Basit == kontrolü
      if (condition.includes(' == ')) {
        const [field, value] = condition.split(' == ').map(s => s.trim());
        const actualValue = this.getFieldValue(field, context);
        
        if (value === 'null') return actualValue === null;
        if (value === 'true') return actualValue === true;
        if (value === 'false') return actualValue === false;
        if (value.startsWith('"') && value.endsWith('"')) {
          return actualValue === value.slice(1, -1);
        }
        return actualValue == value;
      }

      // != kontrolü
      if (condition.includes(' != ')) {
        const [field, value] = condition.split(' != ').map(s => s.trim());
        const actualValue = this.getFieldValue(field, context);
        
        if (value === 'null') return actualValue !== null;
        return actualValue != value;
      }

      // >= kontrolü
      if (condition.includes(' >= ')) {
        const [field, value] = condition.split(' >= ').map(s => s.trim());
        const actualValue = this.getFieldValue(field, context);
        return actualValue >= Number(value);
      }

      // AND kontrolü
      if (condition.includes(' AND ')) {
        const parts = condition.split(' AND ');
        return parts.every(part => this.evaluateSimpleCondition(part.trim(), context));
      }

      return false;
    } catch (error) {
      this.logger.warn(`Condition evaluation failed: ${condition}`, error);
      return false;
    }
  }
}
