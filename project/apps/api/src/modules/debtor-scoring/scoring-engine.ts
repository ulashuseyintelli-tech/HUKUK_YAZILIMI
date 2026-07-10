import {
  DataGap,
  DebtorScoringResult,
  FactorContribution,
  InputProvenance,
  ScoreBand,
  ScoringInput,
} from "./debtor-scoring.types";

/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2A — saf deterministik skor motoru.
 *
 * Kurallar (Bölüm 12, M1-M7 NİHAİ):
 * - SAF fonksiyon: IO/DB/saat erişimi YOK; zaman `input.asOf`'tan gelir.
 * - Polarite: yüksek skor = KÖTÜ. Skor 0-100'e clamp'lenir.
 * - Ağırlıklar (M1): FIN_RECOVERY 25 / ASSET_COVERAGE 25 / CASE_AGE 20 /
 *   STAGE_PROGRESS 15 / BEHAVIOR 15. LEGAL_DEADLINE v1'de 0 (daima DATA_GAP, M5).
 * - Eksik veri (M2): nötr puan (NEUTRALIZED) + dataGaps + warnings; confidence alanı YOK.
 * - Manuel etiket eksenleri (borçlu-düzeyi el etiketi, dosya-düzeyi el etiketi),
 *   operasyonel bildirim kuyruğu durumu ve dormant v4 motoru girdi DEĞİLDİR —
 *   ScoringInput kontratında bu alanlar bilinçli olarak tanımsızdır (statik guard kilitler).
 * - Skor hiçbir zaman tek başına hukuki/finansal aksiyon yetkisi vermez;
 *   motor yalnız skor + açıklama üretir, aksiyon üretmez.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - (PR-2C) DebtorScoringService.calculateCaseScore() -> girdi adaptörlerinden
 *   ScoringInput kurup bu motoru çağırır. PR-2A'da henüz caller yoktur.
 * </remarks>
 */

export const CALCULATION_VERSION = "dscan-v1.0";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** LOW 0-24 · MEDIUM 25-49 · HIGH 50-74 · CRITICAL 75-100. */
export function resolveScoreBand(score: number): ScoreBand {
  if (score < 25) return "LOW";
  if (score < 50) return "MEDIUM";
  if (score < 75) return "HIGH";
  return "CRITICAL";
}

function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export function calculateScore(input: ScoringInput): DebtorScoringResult {
  const factors: FactorContribution[] = [];
  const dataGaps: DataGap[] = [];
  const warnings: string[] = [...(input.warnings ?? [])];

  const caseAgeDays = daysBetween(input.caseSignals.createdAt, input.asOf);

  // ---------- FIN_RECOVERY (0-25): kanonik tahsilat ilerlemesi ----------
  {
    const { source, outstandingTotal, confirmedPaidTotal } = input.financial;
    let points: number;
    let note: string | undefined;

    if (source === "NOT_AVAILABLE" || outstandingTotal === null || confirmedPaidTotal === null) {
      points = 12; // NEUTRALIZED — orta puan (M2)
      note = "Finansal girdi yok — nötr puan uygulandı";
      dataGaps.push({
        code: "FINANCIAL_INPUT_UNAVAILABLE",
        factorCode: "FIN_RECOVERY",
        effect: "NEUTRALIZED",
      });
      warnings.push("FIN_RECOVERY nötr: kanonik finansal girdi sağlanamadı");
    } else {
      const totalDebt = confirmedPaidTotal + outstandingTotal;
      if (totalDebt <= 0) {
        points = 12; // borç tabanı yok — orta risk (F1 emsali)
        note = "Borç tabanı sıfır — orta puan";
      } else {
        const rate = confirmedPaidTotal / totalDebt;
        if (rate >= 0.8) points = 0;
        else if (rate >= 0.5) points = 8;
        else if (rate >= 0.2) points = 15;
        else if (rate > 0) points = 20;
        else points = 25;
        note = `Tahsilat ilerlemesi ${(rate * 100).toFixed(1)}%`;
        if (points === 25 && caseAgeDays < 30) {
          dataGaps.push({
            code: "EARLY_LIFECYCLE",
            factorCode: "FIN_RECOVERY",
            effect: "PARTIAL",
            note: "Dosya 30 günden yeni — tahsilat yokluğu henüz anlamlı sinyal değil",
          });
        }
      }
    }

    factors.push({
      factorCode: "FIN_RECOVERY",
      rawInput: { source, outstandingTotal, confirmedPaidTotal },
      points,
      maxPoints: 25,
      direction: points > 12 ? "RAISES" : points < 12 ? "LOWERS" : "NEUTRAL",
      note,
    });
  }

  // ---------- ASSET_COVERAGE (0-25): sorgu-durumu bazlı varlık sinyali ----------
  {
    const { source, vehicle, realEstate, bank, sgkWage } = input.asset;
    const channels: Array<{ name: string; signal: string; reduction: number }> = [
      { name: "realEstate", signal: realEstate, reduction: 10 },
      { name: "vehicle", signal: vehicle, reduction: 5 },
      { name: "bank", signal: bank, reduction: 5 },
      { name: "sgkWage", signal: sgkWage, reduction: 5 },
    ];
    const informative = channels.filter((c) => c.signal === "YES" || c.signal === "NO");
    let points: number;
    let note: string | undefined;

    if (source === "NOT_AVAILABLE" || informative.length === 0) {
      points = 12; // NEUTRALIZED — hiçbir kanal sorgulanmamış (M2)
      note = "Hiçbir varlık kanalı sorgulanmamış — nötr puan uygulandı";
      dataGaps.push({
        code: "ASSET_QUERY_NOT_RUN",
        factorCode: "ASSET_COVERAGE",
        effect: "NEUTRALIZED",
      });
      warnings.push("ASSET_COVERAGE nötr: varlık sorgusu bilgisi yok");
    } else {
      // YES = varlık bulundu → riski düşürür; NO = sorgulandı ve yok → tam risk katkısı.
      const reduction = informative
        .filter((c) => c.signal === "YES")
        .reduce((sum, c) => sum + c.reduction, 0);
      points = clampScore(25 - reduction, 0, 25);
      const unknownChannels = channels.filter((c) => c.signal !== "YES" && c.signal !== "NO");
      if (unknownChannels.length > 0) {
        dataGaps.push({
          code: "ASSET_QUERY_NOT_RUN",
          factorCode: "ASSET_COVERAGE",
          effect: "PARTIAL",
          note: `Sorgulanmamış kanallar: ${unknownChannels.map((c) => c.name).join(", ")}`,
        });
      }
    }

    factors.push({
      factorCode: "ASSET_COVERAGE",
      rawInput: { source, vehicle, realEstate, bank, sgkWage },
      points,
      maxPoints: 25,
      direction: points > 12 ? "RAISES" : points < 12 ? "LOWERS" : "NEUTRAL",
      note,
    });
  }

  // ---------- CASE_AGE (0-20) ----------
  {
    let points: number;
    if (caseAgeDays < 30) points = 0;
    else if (caseAgeDays < 90) points = 5;
    else if (caseAgeDays < 180) points = 10;
    else if (caseAgeDays < 365) points = 15;
    else points = 20;

    factors.push({
      factorCode: "CASE_AGE",
      rawInput: { createdAt: input.caseSignals.createdAt, asOf: input.asOf, caseAgeDays },
      points,
      maxPoints: 20,
      direction: points > 10 ? "RAISES" : points < 10 ? "LOWERS" : "NEUTRAL",
    });
  }

  // ---------- STAGE_PROGRESS (0-15) ----------
  {
    const stageScores: Record<string, number> = {
      INITIAL: 15,
      PAYMENT_ORDER: 12,
      WAITING_RESPONSE: 10,
      OBJECTION: 15,
      ENFORCEMENT: 8,
      SEIZURE: 5,
      SALE_REQUEST: 3,
      AUCTION: 2,
      COLLECTION: 0,
      PARTIAL_PAYMENT: 5,
      FULL_PAYMENT: 0,
      CLOSED: 0,
      SUSPENDED: 15,
    };
    const points = stageScores[input.caseSignals.workflowStage] ?? 10;

    factors.push({
      factorCode: "STAGE_PROGRESS",
      rawInput: { workflowStage: input.caseSignals.workflowStage },
      points,
      maxPoints: 15,
      direction: points > 8 ? "RAISES" : points < 8 ? "LOWERS" : "NEUTRAL",
    });
  }

  // ---------- BEHAVIOR (0-15): itiraz + CONFIRMED ödeme recency + tebligat durumu ----------
  {
    let points = 7; // başlangıç (F1 emsali)
    const notes: string[] = [];

    if (input.caseSignals.hasObjection) {
      points += 5;
      notes.push("itiraz var (+5)");
    }

    const lastPayment = input.caseSignals.lastConfirmedPaymentAt;
    if (lastPayment !== null && daysBetween(lastPayment, input.asOf) <= 180) {
      points -= 3;
      notes.push("son 180 günde CONFIRMED ödeme (−3)");
    }

    if (input.service.source === "NOT_AVAILABLE") {
      dataGaps.push({
        code: "SERVICE_NOT_INTEGRATED",
        factorCode: "BEHAVIOR",
        effect: "PARTIAL",
        note: "Case'te Tebligat kaydı yok — tebligat alt-bileşeni nötr",
      });
    } else if (["DELIVERED", "MUHTAR", "ANNOUNCEMENT"].includes(input.service.serviceStatus)) {
      points -= 2;
      notes.push("tebliğ gerçekleşmiş (−2)");
    } else if (["RETURNED", "FAILED"].includes(input.service.serviceStatus)) {
      points += 3;
      notes.push("tebligat iade/başarısız (+3)");
    }

    points = clampScore(points, 0, 15);

    factors.push({
      factorCode: "BEHAVIOR",
      rawInput: {
        hasObjection: input.caseSignals.hasObjection,
        lastConfirmedPaymentAt: lastPayment,
        serviceSource: input.service.source,
        serviceStatus: input.service.serviceStatus,
      },
      points,
      maxPoints: 15,
      direction: points > 7 ? "RAISES" : points < 7 ? "LOWERS" : "NEUTRAL",
      note: notes.length > 0 ? notes.join("; ") : undefined,
    });
  }

  // ---------- LEGAL_DEADLINE: v1'de daima EXCLUDED (M5) ----------
  factors.push({
    factorCode: "LEGAL_DEADLINE",
    rawInput: {},
    points: 0,
    maxPoints: 0,
    direction: "NEUTRAL",
    note: "Legal Time Authority hazır olana kadar hesaplanmaz (M5) — kaba tarih hesabı yasak",
  });
  dataGaps.push({
    code: "LEGAL_TIME_AUTHORITY_PENDING",
    factorCode: "LEGAL_DEADLINE",
    effect: "EXCLUDED",
  });
  warnings.push("LEGAL_DEADLINE faktörü v1'de hesaplanmıyor (Legal Time Authority bekleniyor)");

  // ---------- Toplam ----------
  const score = clampScore(
    factors.reduce((sum, f) => sum + f.points, 0),
    0,
    100,
  );

  const inputProvenance: InputProvenance = {
    financial: input.financial.source,
    asset: input.asset.source,
    service: input.service.source,
    legalDeadline: "NOT_AVAILABLE",
  };

  return {
    score,
    scoreBand: resolveScoreBand(score),
    calculationVersion: CALCULATION_VERSION,
    factorBreakdown: factors,
    inputProvenance,
    dataGaps,
    warnings,
    calculatedAt: input.asOf,
    tenantId: input.tenantId,
    caseId: input.caseId,
  };
}
