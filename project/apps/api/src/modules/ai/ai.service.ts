import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';
import { DecisionType } from '@prisma/client';

export interface AiSuggestion {
  action: string;
  reasoning: string;
  confidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  estimatedImpact: string;
}

export interface AiPrediction {
  collectionProbability: number;
  estimatedDays: number;
  riskFactors: string[];
  recommendations: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey && apiKey !== 'sk-your-openai-api-key-here') {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI client initialized');
    } else {
      this.logger.warn('OpenAI API key not configured - using fallback mode');
    }
  }

  // Dosya için AI önerisi al
  async getSuggestions(caseId: string): Promise<AiSuggestion[]> {
    const caseData = await this.getCaseWithDetails(caseId);
    if (!caseData) {
      throw new Error('Case not found');
    }

    // OpenAI varsa gerçek öneri al
    if (this.openai) {
      return this.getOpenAiSuggestions(caseData);
    }

    // Fallback: Kural bazlı öneri
    return this.getRuleBasedSuggestions(caseData);
  }


  // Tahsilat tahmini
  async getPrediction(caseId: string): Promise<AiPrediction> {
    const caseData = await this.getCaseWithDetails(caseId);
    if (!caseData) {
      throw new Error('Case not found');
    }

    if (this.openai) {
      return this.getOpenAiPrediction(caseData);
    }

    return this.getRuleBasedPrediction(caseData);
  }

  // Dosya detaylarını al
  private async getCaseWithDetails(caseId: string) {
    return this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        debtors: {
          include: {
            debtor: {
              include: { assets: true },
            },
          },
        },
        collections: true,
        enforcementActions: true,
        decisionLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        lifecycleEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        riskReports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        formType: true,
      },
    });
  }

  // OpenAI ile öneri al
  private async getOpenAiSuggestions(caseData: any): Promise<AiSuggestion[]> {
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4';
    
    const prompt = this.buildSuggestionPrompt(caseData);
    
    try {
      const response = await this.openai!.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Sen bir icra-iflas hukuku uzmanısın. Türk İcra İflas Kanunu'na göre dosya analizi yapıyorsun.
            Verilen dosya bilgilerine göre en uygun sonraki adımları öner.
            JSON formatında yanıt ver: { "suggestions": [{ "action": string, "reasoning": string, "confidence": number (0-100), "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT", "estimatedImpact": string }] }`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        ...(model.startsWith("o1") ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      // Karar loguna kaydet
      await this.logDecision(caseData.id, DecisionType.NEXT_ACTION, parsed.suggestions?.[0]?.action || 'AI öneri', {
        suggestions: parsed.suggestions,
        confidence: parsed.suggestions?.[0]?.confidence,
      });

      return parsed.suggestions || [];
    } catch (error) {
      this.logger.error('OpenAI suggestion error:', error);
      return this.getRuleBasedSuggestions(caseData);
    }
  }

  // OpenAI ile tahmin al
  private async getOpenAiPrediction(caseData: any): Promise<AiPrediction> {
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4';
    
    const prompt = this.buildPredictionPrompt(caseData);
    
    try {
      const response = await this.openai!.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Sen bir icra-iflas hukuku ve tahsilat uzmanısın. Dosya verilerine göre tahsilat tahmini yap.
            JSON formatında yanıt ver: { "collectionProbability": number (0-100), "estimatedDays": number, "riskFactors": string[], "recommendations": string[] }`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        ...(model.startsWith("o1") ? { max_completion_tokens: 800 } : { max_tokens: 800 }),
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      await this.logDecision(caseData.id, DecisionType.RISK_ASSESSMENT, 'AI tahmin', {
        prediction: parsed,
      });

      return {
        collectionProbability: parsed.collectionProbability || 50,
        estimatedDays: parsed.estimatedDays || 90,
        riskFactors: parsed.riskFactors || [],
        recommendations: parsed.recommendations || [],
      };
    } catch (error) {
      this.logger.error('OpenAI prediction error:', error);
      return this.getRuleBasedPrediction(caseData);
    }
  }


  // Prompt oluştur - Öneri
  private buildSuggestionPrompt(caseData: any): string {
    const totalDebt = Number(caseData.principalAmount || 0);
    const totalCollected = caseData.collections?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0;
    const remainingDebt = totalDebt - totalCollected;
    
    return `
İCRA DOSYASI ANALİZİ:
- Dosya No: ${caseData.fileNumber}
- Takip Türü: ${caseData.type}
- Mevcut Aşama: ${caseData.workflowStage}
- Ana Para: ${totalDebt} TL
- Tahsil Edilen: ${totalCollected} TL
- Kalan Borç: ${remainingDebt} TL
- Risk Skoru: ${caseData.riskScore || 'Hesaplanmadı'}
- Otomatik Mod: ${caseData.isAutoMode ? 'Açık' : 'Kapalı'}

BORÇLU BİLGİLERİ:
${caseData.debtors?.map((d: any) => `- ${d.debtor.name} (${d.debtor.type})`).join('\n') || 'Borçlu bilgisi yok'}

VARLIKLAR:
${caseData.debtors?.flatMap((d: any) => d.debtor.assets?.map((a: any) => `- ${a.type}: ${a.description} (${a.value} TL)`)).join('\n') || 'Varlık bilgisi yok'}

SON İŞLEMLER:
${caseData.lifecycleEvents?.map((e: any) => `- ${e.stage}: ${e.action}`).join('\n') || 'İşlem yok'}

HACİZ İŞLEMLERİ:
${caseData.enforcementActions?.map((e: any) => `- ${e.type}: ${e.status}`).join('\n') || 'Haciz işlemi yok'}

Bu dosya için en uygun 3 sonraki adımı öner.
    `;
  }

  // Prompt oluştur - Tahmin
  private buildPredictionPrompt(caseData: any): string {
    const totalDebt = Number(caseData.principalAmount || 0);
    const totalCollected = caseData.collections?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0;
    const caseAge = Math.floor((Date.now() - new Date(caseData.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    
    return `
TAHSİLAT TAHMİNİ İÇİN DOSYA VERİLERİ:
- Takip Türü: ${caseData.type}
- Dosya Yaşı: ${caseAge} gün
- Mevcut Aşama: ${caseData.workflowStage}
- Toplam Borç: ${totalDebt} TL
- Tahsil Edilen: ${totalCollected} TL
- Tahsilat Oranı: ${totalDebt > 0 ? ((totalCollected / totalDebt) * 100).toFixed(1) : 0}%
- Risk Skoru: ${caseData.riskScore || 50}

BORÇLU PROFİLİ:
- Tip: ${caseData.debtors?.[0]?.debtor?.type || 'Bilinmiyor'}
- Varlık Sayısı: ${caseData.debtors?.flatMap((d: any) => d.debtor.assets || []).length || 0}

GEÇMİŞ KARARLAR:
${caseData.decisionLogs?.map((d: any) => `- ${d.decisionType}: ${d.outcome || 'Beklemede'}`).join('\n') || 'Karar yok'}

Bu dosya için tahsilat olasılığını ve tahmini süreyi hesapla.
    `;
  }

  // Kural bazlı öneri (fallback)
  private getRuleBasedSuggestions(caseData: any): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];
    const stage = caseData.workflowStage;

    switch (stage) {
      case 'INITIAL':
        suggestions.push({
          action: 'Ödeme emri gönder',
          reasoning: 'Dosya yeni açılmış, ilk adım ödeme emri göndermek',
          confidence: 95,
          priority: 'HIGH',
          estimatedImpact: 'Yasal süreç başlatılır',
        });
        break;

      case 'PAYMENT_ORDER':
      case 'WAITING_RESPONSE':
        suggestions.push({
          action: 'Tebligat durumunu kontrol et',
          reasoning: '10 günlük ödeme süresi takibi gerekli',
          confidence: 90,
          priority: 'MEDIUM',
          estimatedImpact: 'Süre dolunca haciz aşamasına geçilebilir',
        });
        break;

      case 'ENFORCEMENT':
        suggestions.push({
          action: 'Banka haczi başlat',
          reasoning: 'En hızlı tahsilat yöntemi',
          confidence: 85,
          priority: 'HIGH',
          estimatedImpact: 'Hesaplarda para varsa hızlı tahsilat',
        });
        suggestions.push({
          action: 'Araç sorgulaması yap',
          reasoning: 'Borçlu adına kayıtlı araç olabilir',
          confidence: 75,
          priority: 'MEDIUM',
          estimatedImpact: 'Araç haczi ile teminat sağlanır',
        });
        break;

      case 'SEIZURE':
        suggestions.push({
          action: 'Satış talebi hazırla',
          reasoning: 'Hacizli malların paraya çevrilmesi gerekli',
          confidence: 80,
          priority: 'HIGH',
          estimatedImpact: 'Tahsilat için satış süreci başlar',
        });
        break;

      default:
        suggestions.push({
          action: 'Dosya durumunu değerlendir',
          reasoning: 'Mevcut aşamaya göre strateji belirle',
          confidence: 70,
          priority: 'MEDIUM',
          estimatedImpact: 'Doğru yönlendirme sağlanır',
        });
    }

    return suggestions;
  }

  // Kural bazlı tahmin (fallback)
  private getRuleBasedPrediction(caseData: any): AiPrediction {
    const totalDebt = Number(caseData.principalAmount || 0);
    const totalCollected = caseData.collections?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0;
    const hasAssets = caseData.debtors?.some((d: any) => d.debtor.assets?.length > 0);
    const riskScore = caseData.riskScore || 50;

    let collectionProbability = 50;
    let estimatedDays = 90;
    const riskFactors: string[] = [];
    const recommendations: string[] = [];

    // Varlık durumu
    if (hasAssets) {
      collectionProbability += 20;
      estimatedDays -= 20;
    } else {
      riskFactors.push('Borçlunun tespit edilmiş varlığı yok');
      recommendations.push('Kapsamlı varlık araştırması yapılmalı');
    }

    // Risk skoru etkisi
    if (riskScore < 30) {
      collectionProbability += 15;
      estimatedDays -= 15;
    } else if (riskScore > 70) {
      collectionProbability -= 20;
      estimatedDays += 30;
      riskFactors.push('Yüksek risk skoru');
    }

    // Kısmi tahsilat varsa
    if (totalCollected > 0) {
      collectionProbability += 10;
      recommendations.push('Borçlu ödeme yapıyor, taksitlendirme önerilebilir');
    }

    // Borç miktarı
    if (totalDebt > 500000) {
      estimatedDays += 30;
      riskFactors.push('Yüksek borç miktarı');
    }

    return {
      collectionProbability: Math.min(95, Math.max(5, collectionProbability)),
      estimatedDays: Math.max(30, estimatedDays),
      riskFactors,
      recommendations,
    };
  }

  // Karar loguna kaydet
  private async logDecision(caseId: string, type: DecisionType, decision: string, data: any) {
    await this.prisma.decisionLog.create({
      data: {
        caseId,
        decisionType: type,
        decision,
        reasoning: data.suggestions?.[0]?.reasoning || data.prediction?.recommendations?.[0],
        confidence: data.confidence || data.suggestions?.[0]?.confidence,
        inputData: data,
        isAutomatic: true,
      },
    });
  }

  // İstatistikler
  async getAiStats(tenantId: string) {
    const [totalDecisions, successfulDecisions, avgConfidence] = await Promise.all([
      this.prisma.decisionLog.count({
        where: { case: { tenantId }, isAutomatic: true },
      }),
      this.prisma.decisionLog.count({
        where: { case: { tenantId }, isAutomatic: true, outcome: 'SUCCESS' },
      }),
      this.prisma.decisionLog.aggregate({
        where: { case: { tenantId }, isAutomatic: true },
        _avg: { confidence: true },
      }),
    ]);

    return {
      totalDecisions,
      successfulDecisions,
      successRate: totalDecisions > 0 ? ((successfulDecisions / totalDecisions) * 100).toFixed(1) : 0,
      avgConfidence: avgConfidence._avg.confidence?.toFixed(1) || 0,
      isOpenAiConfigured: this.openai !== null,
    };
  }
}
