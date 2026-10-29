import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { CpeRequired } from '../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import {
  AccountingJournalManualAdjustmentResult,
  AccountingJournalManualAdjustmentService,
} from './accounting-journal-manual-adjustment.service';
import { CreateManualAdjustmentJournalEntryDto } from './dto/create-manual-adjustment-journal-entry.dto';

// F02-D-2 dilim 1 (owner devam talimatı 30.10.2026): rol kapısı RÜTBEDEN ÖNCE gelir (AK-1a). Servis kapısı (assertOfficeAdmin:
// PARTNER / MANAGER kapasitesi) yalnız kartı sorar — bağlı avukatı PARTNER olan VIEWER manuel düzeltme yazabiliyordu (ölçüldü).
// `ViewerWriteDenyGuard` JwtAuthGuard'dan SONRA; servis kapısı AYNEN korunur (daha dar). Yeni rol / izin YOK.
@Controller('accounting-journal')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class AccountingJournalManualAdjustmentController {
  constructor(private readonly manualAdjustmentService: AccountingJournalManualAdjustmentService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalManualAdjustmentController.createManualAdjustment() -> POST /accounting-journal/entries/manual-adjustments (JWT-only HTTP boundary; service enforces PARTNER/MANAGER office-admin gate).
  /// - AccountingJournalManualAdjustmentService.createManualAdjustment() -> tenant-scoped manual adjustment journal writer + audit transaction with idempotent replay.
  /// </remarks>
  @Post('entries/manual-adjustments')
  @CpeRequired(ActionCode.ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT)
  async createManualAdjustment(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateManualAdjustmentJournalEntryDto,
  ): Promise<AccountingJournalManualAdjustmentResult> {
    return this.manualAdjustmentService.createManualAdjustment(tenantId, actorUserId, {
      idempotencyKey: dto.idempotencyKey,
      sourceName: dto.sourceName,
      reason: dto.reason,
      evidenceRef: dto.evidenceRef,
      amount: dto.amount,
      currency: dto.currency,
      lines: dto.lines,
    });
  }
}
