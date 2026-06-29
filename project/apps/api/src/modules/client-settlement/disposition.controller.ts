import { Controller, Get, Post, Param, Query, Body, Request, UseGuards, Header } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { DispositionPostingService } from './disposition-posting.service';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { DistributionRecommendationService } from './distribution-recommendation.service';
import { PostDispositionDto } from './dto/post-disposition.dto';
import { ApproveDispositionDto } from './dto/approve-disposition.dto';
import { GenerateDistributionRecommendationDto } from './dto/distribution-recommendation.dto';

/** actor compile-time shape — req.user.id auth context (body'den ASLA). */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

@Controller('collection-dispositions')
@UseGuards(JwtAuthGuard)
export class DispositionController {
  constructor(
    private readonly posting: DispositionPostingService,
    private readonly prisma: PrismaService,
    private readonly readService: ClientSettlementReadService,
    private readonly distribution: DistributionRecommendationService,
  ) {}

  /**
   * S8-B FAZ-1a — Dağıtım önerisi üreteci (PREVIEW). recommend-ONLY: persist YOK · P4 YOK · finansal
   * etki YOK. Üretilen satırlar FE'de pre-fill edilir → kullanıcı düzenler → mevcut :id/recommend persist eder.
   * actor = req.user (canonical unpaid masraf adayları için).
   */
  @Post(':id/distribution-recommendation')
  @Header('Cache-Control', 'no-store') // preview · kullanıcı-girdisine bağlı · cache'lenmemeli
  async distributionRecommendation(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: GenerateDistributionRecommendationDto,
  ) {
    const data = await this.distribution.generate(req.user.tenantId, id, body ?? {}, { userId: req.user.id });
    return { data };
  }

  /** Dosya bazlı dağıtım listesi (review UI; default tüm statüler). */
  @Get('case/:caseId')
  async listByCase(
    @Request() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: string,
  ) {
    const tenantId = req.user.tenantId;
    const data = await this.prisma.collectionDisposition.findMany({
      where: { tenantId, caseId, ...(status ? { status: status as never } : {}) },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  /** Müvekkile borç (outstanding) — read. UI HESAPLAMAZ; otorite backend (tek computeOutstanding). */
  @Get('case/:caseId/outstanding')
  async outstanding(
    @Request() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('caseClientId') caseClientId: string,
    @Query('currency') currency?: string,
  ) {
    const data = await this.readService.getOutstanding(req.user.tenantId, caseId, caseClientId, currency || 'TRY');
    return { data };
  }

  /** S8-B FAZ-0 — Dağıtım önerisi: line'lar yazılır (finansal etki YOK) + P4 onay talebi açılır. actor = requester. */
  @Post(':id/recommend')
  async recommend(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: PostDispositionDto) {
    const data = await this.posting.recommend(req.user.tenantId, id, body, { userId: req.user.id });
    return { data };
  }

  /** S8-B FAZ-0 — Dağıtım onayı: yalnız PARTNER/yetkilendirilmiş avukat + P4 4-göz (requester onaylayamaz). actor = approver. */
  @Post(':id/approve')
  async approve(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: ApproveDispositionDto) {
    const data = await this.posting.approve(req.user.tenantId, id, { userId: req.user.id }, body?.note);
    return { data };
  }

  /** Dağıtım kararını POSTED yap — YALNIZ DISTRIBUTION_APPROVED (Partner/Manager onayı sonrası). actor = req.user.id. */
  @Post(':id/post')
  async post(@Request() req: AuthRequest, @Param('id') id: string) {
    const data = await this.posting.post(req.user.tenantId, id, { userId: req.user.id });
    return { data };
  }
}
