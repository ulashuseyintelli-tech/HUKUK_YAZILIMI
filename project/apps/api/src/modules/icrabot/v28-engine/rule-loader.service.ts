/**
 * v28 Rule Loader Service
 * 
 * YAML kurallarını DB'den veya dosyadan yükleyen servis.
 * Python v28_rulepack_versioning/engine_v28/rules/loader.py'den port edildi.
 * 
 * Features:
 * - DB-backed rule storage
 * - Rule versioning with SHA256 hashing
 * - Hot reload support
 * - In-memory caching with ETags
 * - Pack-based loading
 * - Rule metadata stamping for EngineRun
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RuleDefinition } from './engine-runner.service';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface RulePack {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  rules: RuleDefinition[];
}

export interface LoadedRule {
  ruleKey: string;
  packName: string;
  revisionId: string;
  version: number;
  sha256: string;
  ruleDict: RuleDefinition;
}

export interface RuleMeta {
  revisionId: string;
  version: number;
  sha256: string;
  packName: string;
  ruleKey: string;
}

interface CacheEntry {
  etag: string;
  rules: LoadedRule[];
  loadedAt: Date;
}

@Injectable()
export class RuleLoaderService implements OnModuleInit {
  private readonly logger = new Logger(RuleLoaderService.name);
  private rulesCache: Map<string, RuleDefinition[]> = new Map();
  private packCache: Map<string, CacheEntry> = new Map(); // Pack-based cache
  private lastLoadTime: Date | null = null;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 dakika

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadDefaultRules();
  }

  /**
   * SHA256 hash hesaplar (Python rule_sha256)
   */
  computeSha256(ruleDict: RuleDefinition): string {
    const content = JSON.stringify(ruleDict, Object.keys(ruleDict).sort(), 2);
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${hash}`;
  }

  /**
   * Rule'a metadata ekler (Python attach_meta)
   */
  attachMeta(ruleDict: RuleDefinition, meta: RuleMeta): RuleDefinition {
    return {
      ...ruleDict,
      _meta: {
        ...meta,
        sha256: meta.sha256 || this.computeSha256(ruleDict),
      },
    };
  }

  /**
   * Pack ETag hesaplar (cache invalidation için)
   */
  private computePackEtag(pack: { updatedAt: Date; isActive: boolean }): string {
    return `${pack.updatedAt.toISOString()}:${pack.isActive}`;
  }

  /**
   * Aktif kuralları döner (cached)
   */
  async getActiveRules(): Promise<RuleDefinition[]> {
    const cacheKey = 'active_rules';
    
    // Check cache
    if (this.rulesCache.has(cacheKey) && this.lastLoadTime) {
      const age = Date.now() - this.lastLoadTime.getTime();
      if (age < this.cacheTtlMs) {
        return this.rulesCache.get(cacheKey)!;
      }
    }

    // Load from DB
    const rules = await this.loadFromDb();
    this.rulesCache.set(cacheKey, rules);
    this.lastLoadTime = new Date();

    return rules;
  }

  /**
   * Cache'i invalidate eder (hot reload için)
   */
  invalidateCache(packName?: string): void {
    if (packName) {
      this.packCache.delete(packName);
      this.logger.log(`Rule cache invalidated for pack: ${packName}`);
    } else {
      this.rulesCache.clear();
      this.packCache.clear();
      this.lastLoadTime = null;
      this.logger.log('Rule cache invalidated (all)');
    }
  }

  /**
   * Pack bazlı kuralları yükler (Python load_active)
   */
  async loadActivePack(packName: string): Promise<LoadedRule[]> {
    // Check cache
    const cached = this.packCache.get(packName);
    
    try {
      const pack = await (this.prisma as any).icrabotRulePack.findFirst({
        where: { name: packName, isActive: true },
      });

      if (!pack) {
        this.logger.warn(`Pack not found or inactive: ${packName}`);
        return [];
      }

      const etag = this.computePackEtag(pack);

      // Return cached if etag matches
      if (cached && cached.etag === etag) {
        return cached.rules;
      }

      // Load enabled rules with their latest active revision
      const rules = await (this.prisma as any).icrabotRule.findMany({
        where: { packId: pack.id, isActive: true },
        include: {
          revisions: {
            where: { isActive: true },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      const loadedRules: LoadedRule[] = [];

      for (const rule of rules) {
        if (!rule.revisions || rule.revisions.length === 0) continue;

        const rev = rule.revisions[0];
        
        try {
          const ruleDict = yaml.load(rev.content) as RuleDefinition;
          const sha256 = rev.sha256 || this.computeSha256(ruleDict);

          loadedRules.push({
            ruleKey: rule.ruleKey,
            packName,
            revisionId: rev.id,
            version: rev.version,
            sha256,
            ruleDict,
          });
        } catch (e: any) {
          this.logger.error(`Failed to parse rule ${packName}:${rule.ruleKey}: ${e.message}`);
        }
      }

      // Update cache
      this.packCache.set(packName, {
        etag,
        rules: loadedRules,
        loadedAt: new Date(),
      });

      this.logger.log(`Loaded ${loadedRules.length} rules from pack: ${packName}`);
      return loadedRules;

    } catch (error: any) {
      this.logger.warn(`Failed to load pack ${packName}: ${error.message}`);
      return cached?.rules || [];
    }
  }

  /**
   * Tüm aktif pack'leri listeler
   */
  async listActivePacks(): Promise<Array<{ id: string; name: string; ruleCount: number }>> {
    try {
      const packs = await (this.prisma as any).icrabotRulePack.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: { rules: { where: { isActive: true } } },
          },
        },
      });

      return packs.map((p: any) => ({
        id: p.id,
        name: p.name,
        ruleCount: p._count?.rules || 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * DB'den kuralları yükler
   */
  private async loadFromDb(): Promise<RuleDefinition[]> {
    try {
      const dbRules = await (this.prisma as any).icrabotRuleRevision.findMany({
        where: {
          isActive: true,
          rule: {
            isActive: true,
            pack: {
              isActive: true,
            },
          },
        },
        include: {
          rule: {
            include: {
              pack: true,
            },
          },
        },
        orderBy: {
          version: 'desc',
        },
      });

      const rules: RuleDefinition[] = [];
      const seenRules = new Set<string>();

      for (const dbRule of dbRules) {
        const ruleKey = `${dbRule.rule.pack.name}:${dbRule.rule.ruleKey}`;
        
        // Her rule için sadece en son aktif versiyonu al
        if (seenRules.has(ruleKey)) continue;
        seenRules.add(ruleKey);

        try {
          const parsed = yaml.load(dbRule.content) as RuleDefinition;
          rules.push(parsed);
        } catch (e: any) {
          this.logger.error(`Failed to parse rule ${ruleKey}: ${e.message}`);
        }
      }

      this.logger.log(`Loaded ${rules.length} rules from DB`);
      return rules;

    } catch (error: any) {
      this.logger.warn(`Failed to load rules from DB: ${error.message}, using defaults`);
      return this.getDefaultRules();
    }
  }

  /**
   * Varsayılan kuralları yükler
   */
  private async loadDefaultRules(): Promise<void> {
    const defaultRules = this.getDefaultRules();
    this.rulesCache.set('active_rules', defaultRules);
    this.lastLoadTime = new Date();
    this.logger.log(`Loaded ${defaultRules.length} default rules`);
  }

  /**
   * Varsayılan kural tanımları
   */
  private getDefaultRules(): RuleDefinition[] {
    return [
      // Rule 1: Araç bulunduğunda risk hesapla
      {
        version: 'v28',
        rule_id: 'post_asset_discovery_vehicle',
        when: {
          all: [
            { fact: 'case.status', op: '==', value: 'finalized' },
            { fact: 'assets.vehicle.found', op: '==', value: true },
          ],
        },
        then: {
          compute: [
            {
              name: 'risk',
              run: 'RiskScoring',
              input: {
                case_id: '{{fact.case.id}}',
                debtor_id: '{{fact.debtor.id}}',
              },
            },
            {
              name: 'expected_recovery',
              run: 'RecoverySimulator',
              input: {
                case_id: '{{fact.case.id}}',
                enforcement_rank: '{{fact.lien.rank}}',
                vehicle_value_estimate: '{{fact.assets.vehicle.estimated_value}}',
              },
            },
          ],
          write: {
            facts: [
              { path: 'engine.risk.score', value: '{{compute.risk.score}}' },
              { path: 'engine.risk.band', value: '{{compute.risk.band}}' },
              { path: 'engine.recovery.p50', value: '{{compute.expected_recovery.p50}}' },
            ],
            flags: [
              { key: 'HIGH_RISK', value: "get('compute.risk.score') >= 80" },
            ],
          },
          decisions: [
            {
              if: "get('compute.risk.score') >= 80",
              then: [
                {
                  action: 'open_lock',
                  payload: {
                    key: 'case:{{fact.case.id}}:manual_review',
                    ttl_sec: 86400,
                  },
                },
                {
                  action: 'enqueue',
                  payload: {
                    queue: 'manual_review',
                    case_id: '{{fact.case.id}}',
                    reason: 'High risk score',
                  },
                },
              ],
            },
            {
              if: "get('compute.expected_recovery.p50') >= 50000 and get('compute.risk.score') < 80",
              then: [
                {
                  action: 'enqueue',
                  payload: {
                    queue: 'advance_request_email',
                    case_id: '{{fact.case.id}}',
                    amount: '{{compute.expected_recovery.p50}}',
                  },
                },
              ],
            },
          ],
        },
      },

      // Rule 2: Tebligat tamamlandığında kesinleşme kontrolü
      {
        version: 'v28',
        rule_id: 'post_tebligat_finalization_check',
        when: {
          all: [
            { expr: "flags.TEBLIGAT_COMPLETED == true" },
          ],
        },
        then: {
          compute: [
            {
              name: 'debtor_behavior',
              run: 'DebtorBehaviorScore',
              input: {
                debtor_id: '{{fact.debtor.id}}',
                case_id: '{{fact.case.id}}',
              },
            },
          ],
          write: {
            facts: [
              { path: 'engine.debtor.behavior_score', value: '{{compute.debtor_behavior.score}}' },
              { path: 'engine.debtor.category', value: '{{compute.debtor_behavior.category}}' },
            ],
          },
          decisions: [
            {
              if: "get('compute.debtor_behavior.category') == 'COOPERATIVE'",
              then: [
                {
                  action: 'enqueue',
                  payload: {
                    queue: 'settlement_offer',
                    case_id: '{{fact.case.id}}',
                    debtor_id: '{{fact.debtor.id}}',
                  },
                },
              ],
            },
          ],
        },
      },

      // Rule 3: Ödeme alındığında dosya kapanış kontrolü
      {
        version: 'v28',
        rule_id: 'post_payment_closure_check',
        when: {
          all: [
            { fact: 'payment.received', op: '==', value: true },
          ],
        },
        then: {
          decisions: [
            {
              if: "get('fact.payment.total_collected') >= get('fact.case.total_debt')",
              then: [
                {
                  action: 'enqueue',
                  payload: {
                    queue: 'case_closure',
                    case_id: '{{fact.case.id}}',
                    reason: 'Full payment received',
                  },
                },
                {
                  action: 'send_notification',
                  payload: {
                    type: 'case_closed',
                    case_id: '{{fact.case.id}}',
                    recipient: 'client',
                  },
                },
              ],
            },
          ],
        },
      },

      // Rule 4: Haciz konulduğunda satış planla
      {
        version: 'v28',
        rule_id: 'post_haciz_sale_planning',
        when: {
          all: [
            { expr: "flags.HACIZ_ACTIVE == true" },
            { fact: 'haciz.type', op: '==', value: 'VEHICLE' },
          ],
        },
        then: {
          compute: [
            {
              name: 'lien_rank',
              run: 'LienRankCalculator',
              input: {
                case_id: '{{fact.case.id}}',
                asset_type: 'VEHICLE',
              },
            },
            {
              name: 'valuation',
              run: 'AssetValuation',
              input: {
                asset_type: 'VEHICLE',
                asset_details: {
                  plate: '{{fact.assets.vehicle.plate}}',
                  year: '{{fact.assets.vehicle.year}}',
                  basePrice: '{{fact.assets.vehicle.estimated_value}}',
                },
              },
            },
          ],
          write: {
            facts: [
              { path: 'engine.lien.rank', value: '{{compute.lien_rank.rank}}' },
              { path: 'engine.lien.is_first', value: '{{compute.lien_rank.isFirstRank}}' },
              { path: 'engine.valuation.amount', value: '{{compute.valuation.estimatedValue}}' },
            ],
          },
          decisions: [
            {
              if: "get('compute.lien_rank.isFirstRank') == true and get('compute.valuation.estimatedValue') >= 100000",
              then: [
                {
                  action: 'enqueue',
                  payload: {
                    queue: 'sale_planning',
                    case_id: '{{fact.case.id}}',
                    asset_type: 'VEHICLE',
                    estimated_value: '{{compute.valuation.estimatedValue}}',
                  },
                },
              ],
            },
          ],
        },
      },
    ];
  }

  /**
   * YAML dosyasından kural yükler
   */
  async loadFromFile(filePath: string): Promise<RuleDefinition[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = yaml.load(content);
      
      if (Array.isArray(data)) {
        return data as RuleDefinition[];
      }
      return [data as RuleDefinition];
    } catch (error: any) {
      this.logger.error(`Failed to load rules from file ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Yeni kural ekler (DB'ye) - SHA256 hash ile
   */
  async addRule(
    packName: string,
    ruleKey: string,
    content: string,
    createdBy?: string,
    note?: string,
  ): Promise<string> {
    // Pack'i bul veya oluştur
    let pack = await (this.prisma as any).icrabotRulePack.findFirst({
      where: { name: packName },
    });

    if (!pack) {
      pack = await (this.prisma as any).icrabotRulePack.create({
        data: {
          name: packName,
          isActive: true,
        },
      });
    }

    // Rule'u bul veya oluştur
    let rule = await (this.prisma as any).icrabotRule.findFirst({
      where: { packId: pack.id, ruleKey },
    });

    if (!rule) {
      rule = await (this.prisma as any).icrabotRule.create({
        data: {
          packId: pack.id,
          ruleKey,
          isActive: true,
        },
      });
    }

    // Yeni revision oluştur
    const lastRevision = await (this.prisma as any).icrabotRuleRevision.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
    });

    const newVersion = (lastRevision?.version || 0) + 1;

    // SHA256 hesapla
    let sha256: string;
    try {
      const parsed = yaml.load(content) as RuleDefinition;
      sha256 = this.computeSha256(parsed);
    } catch {
      // YAML parse edilemezse raw content'ten hash al
      sha256 = `sha256:${crypto.createHash('sha256').update(content, 'utf8').digest('hex')}`;
    }

    // Eski revision'ları deaktive et
    await (this.prisma as any).icrabotRuleRevision.updateMany({
      where: { ruleId: rule.id },
      data: { isActive: false },
    });

    // Yeni revision oluştur
    const revision = await (this.prisma as any).icrabotRuleRevision.create({
      data: {
        ruleId: rule.id,
        version: newVersion,
        content,
        sha256,
        createdBy,
        note,
        isActive: true,
      },
    });

    // Cache'i invalidate et
    this.invalidateCache(packName);

    this.logger.log(`Added rule ${packName}:${ruleKey} v${newVersion} (${sha256.substring(0, 20)}...)`);

    return revision.id;
  }

  // ==================== ROLLBACK API ====================
  // Python v28_explainability_rollback/engine_v28/rules/rollback_api.py'den port edildi.

  /**
   * Belirli bir revision'ı devre dışı bırakır
   */
  async disableRevision(revisionId: string): Promise<{ packName: string; ruleKey: string }> {
    const revision = await (this.prisma as any).icrabotRuleRevision.findUnique({
      where: { id: revisionId },
      include: {
        rule: {
          include: { pack: true },
        },
      },
    });

    if (!revision) {
      throw new Error(`Revision not found: ${revisionId}`);
    }

    // Revision'ı devre dışı bırak
    await (this.prisma as any).icrabotRuleRevision.update({
      where: { id: revisionId },
      data: { isActive: false },
    });

    // Cache'i invalidate et
    this.invalidateCache();

    this.logger.log(`Disabled revision ${revisionId} (${revision.rule.pack.name}:${revision.rule.ruleKey})`);

    return {
      packName: revision.rule.pack.name,
      ruleKey: revision.rule.ruleKey,
    };
  }

  /**
   * Belirli bir rule'u tamamen devre dışı bırakır
   */
  async disableRule(packName: string, ruleKey: string): Promise<void> {
    const pack = await (this.prisma as any).icrabotRulePack.findFirst({
      where: { name: packName },
    });

    if (!pack) {
      throw new Error(`Pack not found: ${packName}`);
    }

    const rule = await (this.prisma as any).icrabotRule.findFirst({
      where: { packId: pack.id, ruleKey },
    });

    if (!rule) {
      throw new Error(`Rule not found: ${packName}:${ruleKey}`);
    }

    await (this.prisma as any).icrabotRule.update({
      where: { id: rule.id },
      data: { isActive: false },
    });

    // Cache'i invalidate et
    this.invalidateCache();

    this.logger.log(`Disabled rule ${packName}:${ruleKey}`);
  }

  /**
   * Belirli bir rule'u tekrar aktif eder
   */
  async enableRule(packName: string, ruleKey: string): Promise<void> {
    const pack = await (this.prisma as any).icrabotRulePack.findFirst({
      where: { name: packName },
    });

    if (!pack) {
      throw new Error(`Pack not found: ${packName}`);
    }

    const rule = await (this.prisma as any).icrabotRule.findFirst({
      where: { packId: pack.id, ruleKey },
    });

    if (!rule) {
      throw new Error(`Rule not found: ${packName}:${ruleKey}`);
    }

    await (this.prisma as any).icrabotRule.update({
      where: { id: rule.id },
      data: { isActive: true },
    });

    // Cache'i invalidate et
    this.invalidateCache();

    this.logger.log(`Enabled rule ${packName}:${ruleKey}`);
  }

  /**
   * Belirli bir versiyona pin'ler (rollback)
   */
  async pinVersion(packName: string, ruleKey: string, version: number): Promise<void> {
    const pack = await (this.prisma as any).icrabotRulePack.findFirst({
      where: { name: packName },
    });

    if (!pack) {
      throw new Error(`Pack not found: ${packName}`);
    }

    const rule = await (this.prisma as any).icrabotRule.findFirst({
      where: { packId: pack.id, ruleKey },
    });

    if (!rule) {
      throw new Error(`Rule not found: ${packName}:${ruleKey}`);
    }

    // Versiyon var mı kontrol et
    const revision = await (this.prisma as any).icrabotRuleRevision.findFirst({
      where: { ruleId: rule.id, version },
    });

    if (!revision) {
      throw new Error(`Version ${version} not found for rule ${packName}:${ruleKey}`);
    }

    // Tüm revision'ları deaktive et
    await (this.prisma as any).icrabotRuleRevision.updateMany({
      where: { ruleId: rule.id },
      data: { isActive: false },
    });

    // Sadece pin'lenen versiyonu aktive et
    await (this.prisma as any).icrabotRuleRevision.update({
      where: { id: revision.id },
      data: { isActive: true },
    });

    // Cache'i invalidate et
    this.invalidateCache();

    this.logger.log(`Pinned rule ${packName}:${ruleKey} to version ${version}`);
  }

  /**
   * Rule versiyonlarını listeler
   */
  async getRuleVersions(packName: string, ruleKey: string): Promise<{
    versions: Array<{
      id: string;
      version: number;
      isActive: boolean;
      createdAt: Date;
    }>;
  }> {
    const pack = await (this.prisma as any).icrabotRulePack.findFirst({
      where: { name: packName },
    });

    if (!pack) {
      throw new Error(`Pack not found: ${packName}`);
    }

    const rule = await (this.prisma as any).icrabotRule.findFirst({
      where: { packId: pack.id, ruleKey },
    });

    if (!rule) {
      throw new Error(`Rule not found: ${packName}:${ruleKey}`);
    }

    const revisions = await (this.prisma as any).icrabotRuleRevision.findMany({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        isActive: true,
        createdAt: true,
      },
    });

    return { versions: revisions };
  }
}
