import { Controller, Get, Post, Param, Query, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { DispositionPostingService } from './disposition-posting.service';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { PostDispositionDto } from './dto/post-disposition.dto';

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
  ) {}

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

  /** Dağıtım kararını POSTED yap (kullanıcı onayı). actor = req.user.id. */
  @Post(':id/post')
  async post(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: PostDispositionDto) {
    const data = await this.posting.post(req.user.tenantId, id, body, { userId: req.user.id });
    return { data };
  }
}
