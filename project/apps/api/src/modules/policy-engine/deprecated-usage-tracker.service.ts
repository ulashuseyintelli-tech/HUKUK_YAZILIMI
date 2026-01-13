/**
 * Deprecated Usage Tracker Service
 * 
 * Eski rule-engine servislerinin kullanımını takip eder.
 * Silme kriteri: 7 gün boyunca 0 usage.
 * 
 * @see tasks.md - Section 6.4.4
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

interface UsageRecord {
  serviceName: string;
  methodName: string;
  calledAt: Date;
  callerFile?: string;
  callerLine?: number;
}

interface DailyUsageReport {
  date: string;
  services: {
    [serviceName: string]: {
      totalCalls: number;
      methods: { [methodName: string]: number };
    };
  };
}

/**
 * Deprecated servis kullanımını takip eder.
 * 
 * Kullanım:
 * 1. Deprecated servislerde constructor'da `tracker.recordUsage()` çağır
 * 2. Daily cron ile rapor oluştur
 * 3. 7 gün 0 usage → silme için PR aç
 */
@Injectable()
export class DeprecatedUsageTrackerService implements OnModuleInit {
  private readonly logger = new Logger(DeprecatedUsageTrackerService.name);
  
  /** In-memory usage buffer (DB'ye batch yazılır) */
  private usageBuffer: UsageRecord[] = [];
  
  /** Daily usage counts (memory cache) */
  private dailyUsage = new Map<string, Map<string, number>>();
  
  /** Consecutive zero-usage days per service */
  private zeroUsageDays = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Deprecated Usage Tracker initialized');
  }

  /**
   * Deprecated servis kullanımını kaydet.
   * Her deprecated servisin constructor'ında çağrılmalı.
   */
  recordUsage(serviceName: string, methodName: string = 'constructor'): void {
    const record: UsageRecord = {
      serviceName,
      methodName,
      calledAt: new Date(),
    };

    // Stack trace'den caller bilgisi al (opsiyonel)
    try {
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split('\n');
        // 3. satır genellikle gerçek caller
        if (lines[3]) {
          const match = lines[3].match(/at\s+(.+)\s+\((.+):(\d+):\d+\)/);
          if (match) {
            record.callerFile = match[2];
            record.callerLine = parseInt(match[3], 10);
          }
        }
      }
    } catch {
      // Stack trace alınamazsa devam et
    }

    this.usageBuffer.push(record);

    // Daily counter güncelle
    const today = new Date().toISOString().split('T')[0];
    if (!this.dailyUsage.has(today)) {
      this.dailyUsage.set(today, new Map());
    }
    const todayUsage = this.dailyUsage.get(today)!;
    const key = `${serviceName}.${methodName}`;
    todayUsage.set(key, (todayUsage.get(key) || 0) + 1);

    // Warning log (ilk kullanımda)
    if (todayUsage.get(key) === 1) {
      this.logger.warn(
        `⚠️ DEPRECATED: ${serviceName}.${methodName}() kullanıldı. ` +
        `CPE'ye geçin: import { RuleEngineService } from '@/modules/policy-engine'`
      );
    }
  }

  /**
   * Günlük kullanım raporunu döndür.
   */
  getDailyReport(date?: string): DailyUsageReport {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const usage = this.dailyUsage.get(targetDate) || new Map();

    const services: DailyUsageReport['services'] = {};

    for (const [key, count] of usage) {
      const [serviceName, methodName] = key.split('.');
      
      if (!services[serviceName]) {
        services[serviceName] = { totalCalls: 0, methods: {} };
      }
      
      services[serviceName].totalCalls += count;
      services[serviceName].methods[methodName] = count;
    }

    return {
      date: targetDate,
      services,
    };
  }

  /**
   * Toplam kullanım sayısını döndür (bugün için).
   */
  getTodayUsageCount(): number {
    const today = new Date().toISOString().split('T')[0];
    const usage = this.dailyUsage.get(today);
    
    if (!usage) return 0;
    
    let total = 0;
    for (const count of usage.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Belirli bir servisin ardışık sıfır kullanım gün sayısını döndür.
   */
  getZeroUsageDays(serviceName: string): number {
    return this.zeroUsageDays.get(serviceName) || 0;
  }

  /**
   * Silme için hazır mı kontrol et.
   * Kriter: 7 gün boyunca 0 usage
   */
  isReadyForRemoval(serviceName: string): boolean {
    return this.getZeroUsageDays(serviceName) >= 7;
  }

  /**
   * Tüm deprecated servislerin durumunu döndür.
   */
  getRemovalStatus(): Array<{
    serviceName: string;
    zeroUsageDays: number;
    readyForRemoval: boolean;
    lastUsage?: Date;
  }> {
    const services = [
      'RuleEngine (automation)',
      'RuleEngineService (rule-engine)',
    ];

    return services.map(serviceName => ({
      serviceName,
      zeroUsageDays: this.getZeroUsageDays(serviceName),
      readyForRemoval: this.isReadyForRemoval(serviceName),
      lastUsage: this.getLastUsage(serviceName),
    }));
  }

  /**
   * Son kullanım tarihini döndür.
   */
  private getLastUsage(serviceName: string): Date | undefined {
    const records = this.usageBuffer.filter(r => r.serviceName === serviceName);
    if (records.length === 0) return undefined;
    return records[records.length - 1].calledAt;
  }

  // ============================================
  // Scheduled Jobs
  // ============================================

  /**
   * Günlük rapor oluştur ve logla.
   * Her gün 00:05'te çalışır.
   */
  @Cron('5 0 * * *')
  async generateDailyReport(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const report = this.getDailyReport(dateStr);
    
    // Zero usage günlerini güncelle
    const trackedServices = ['RuleEngine (automation)', 'RuleEngineService (rule-engine)'];
    
    for (const serviceName of trackedServices) {
      const serviceUsage = report.services[serviceName];
      
      if (!serviceUsage || serviceUsage.totalCalls === 0) {
        // Sıfır kullanım - counter artır
        const current = this.zeroUsageDays.get(serviceName) || 0;
        this.zeroUsageDays.set(serviceName, current + 1);
        
        this.logger.log(
          `📊 ${serviceName}: ${current + 1} gün ardışık sıfır kullanım`
        );
      } else {
        // Kullanım var - counter sıfırla
        this.zeroUsageDays.set(serviceName, 0);
        
        this.logger.warn(
          `⚠️ ${serviceName}: ${serviceUsage.totalCalls} kullanım (${dateStr})`
        );
      }
    }

    // Silme için hazır olanları bildir
    for (const serviceName of trackedServices) {
      if (this.isReadyForRemoval(serviceName)) {
        this.logger.log(
          `✅ ${serviceName}: 7 gün sıfır kullanım - SİLME İÇİN HAZIR!`
        );
      }
    }
  }

  /**
   * Buffer'ı DB'ye yaz (her saat).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async flushBuffer(): Promise<void> {
    if (this.usageBuffer.length === 0) return;

    const records = [...this.usageBuffer];
    this.usageBuffer = [];

    try {
      // Batch insert (CpeDeprecatedUsage tablosu varsa)
      // Şimdilik sadece log
      this.logger.debug(`Flushed ${records.length} deprecated usage records`);
    } catch (error) {
      // Hata durumunda buffer'a geri ekle
      this.usageBuffer.push(...records);
      this.logger.error('Failed to flush deprecated usage buffer', error);
    }
  }

  /**
   * Eski kayıtları temizle (30 günden eski).
   */
  @Cron('0 3 * * *') // Her gün 03:00
  async cleanupOldRecords(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Memory'deki eski günleri temizle
    for (const [date] of this.dailyUsage) {
      if (date < cutoffStr) {
        this.dailyUsage.delete(date);
      }
    }

    this.logger.debug('Cleaned up old deprecated usage records');
  }
}
