import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query, ForbiddenException, NotFoundException, ValidationPipe, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientIntakeLinkService } from '../client-intake-link/client-intake-link.service';
import { CreateClientWorkspaceIntakeLinkDto } from '../client-intake-link/dto/client-intake-link.dto';
import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto } from './dto/create-client.dto';

/** C0-a: actor compile-time shape â€” req.user JWT validate'ten gelen User; id+tenantId auth context. */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(private clientService: ClientService, private clientIntakeLinkService: ClientIntakeLinkService) {}

  // Task 2 (owner-locked 2026-06-30): client gÃ¶vde doÄŸrulamasÄ± GÃœVENLÄ°/KADEMELÄ°.
  // app.main.ts global ValidationPipe forbidNonWhitelisted:true â†’ route-level pipe onu OVERRIDE EDEMEZ
  // (NestJS global+local ikisi de Ã§alÄ±ÅŸÄ±r). Bu yÃ¼zden @Body() any KASITLI (global pipe inert) + bu lenient
  // pipe MANUEL invoke edilir: whitelist:true (fazla alan dÃ¼ÅŸer), forbidNonWhitelisted:false (fazla alan
  // 400 SEBEBÄ° DEÄÄ°L). Strict forbid + TCKN/VKN mod-10/11 checksum = ayrÄ± "Client DTO Strictness Audit".
  private readonly clientBodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    skipMissingProperties: true,
  });

  private readonly intakeLinkBodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  // TÃ¼m mÃ¼vekkilleri listele
  @Get()
  async findAll(@Request() req: any, @Query('type') type?: string, @Query('search') search?: string) {
    const tenantId = req.user.tenantId;
    if (search) {
      return { data: await this.clientService.search(tenantId, search) };
    }
    return { data: await this.clientService.findAll(tenantId, type) };
  }

  // Client Workspace timeline (read-only V1)
  @Get(':clientId/timeline')
  async timeline(
    @Request() req: any,
    @Param('clientId') clientId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('sources') sources?: string,
  ) {
    return this.clientService.getTimeline(clientId, req.user.tenantId, { limit, cursor, sources });
  }

  // Client Workspace action catalog (read-only V1)
  @Get(':clientId/action-catalog')
  async actionCatalog(
    @Request() req: any,
    @Param('clientId') clientId: string,
  ) {
    return this.clientService.getActionCatalog(clientId, req.user.tenantId, req.user.role);
  }

  // Client Workspace operating snapshot (read-only V1)
  @Get(':clientId/operating-snapshot')
  async operatingSnapshot(
    @Request() req: any,
    @Param('clientId') clientId: string,
  ) {
    return this.clientService.getOperatingSnapshot(clientId, req.user.tenantId);
  }

  // Client Workspace intake link create command (create-only; dispatch yok)
  @Post(':clientId/cases/:caseId/intake-links')
  async createIntakeLink(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('caseId') caseId: string,
    @Body() body: any,
  ) {
    const dto = await this.intakeLinkBodyPipe.transform(body, { type: 'body', metatype: CreateClientWorkspaceIntakeLinkDto });
    const result = await this.clientIntakeLinkService.createForClientWorkspace(
      req.user.tenantId,
      clientId,
      caseId,
      req.user.id,
      dto as CreateClientWorkspaceIntakeLinkDto,
    );
    return { data: result };
  }

  // Client Workspace intake link create-and-deliver typed command (raw URL response yok)
  @Post(':clientId/cases/:caseId/intake-links/create-and-deliver')
  async createAndDeliverIntakeLink(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('caseId') caseId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: any,
  ) {
    const dto = await this.intakeLinkBodyPipe.transform(body, { type: 'body', metatype: CreateClientWorkspaceIntakeLinkDto });
    const result = await this.clientIntakeLinkService.createAndDeliverForClientWorkspace(
      req.user.tenantId,
      clientId,
      caseId,
      req.user.id,
      idempotencyKey,
      dto as CreateClientWorkspaceIntakeLinkDto,
    );
    return { data: result };
  }

  // Fetch one client
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const client = await this.clientService.findOne(id, tenantId);
    // P0.4: bulunamayan kayÄ±t 404 (eski: HTTP 200 + {error} â†’ FE !response.ok kontrolÃ¼ "baÅŸarÄ±" sanÄ±yordu).
    if (!client) throw new NotFoundException('MÃ¼vekkil bulunamadÄ±');
    return { data: client };
  }

  // Yeni mÃ¼vekkil oluÅŸtur
  @Post()
  async create(@Request() req: AuthRequest, @Body() body: any) {
    const tenantId = req.user.tenantId;
    // Task 2: tip/format doÄŸrulamasÄ± (lenient â€” fazla alan 400 deÄŸil, dÃ¼ÅŸer). @Body() any â†’ global pipe inert.
    const dto = await this.clientBodyPipe.transform(body, { type: 'body', metatype: CreateClientDto });
    // C0-a: actor YALNIZ req.user.id (auth); body'den userId ASLA okunmaz.
    // P0.4: hata yutma YOK â€” service exception'larÄ± (NotFound/Conflict/500) gerÃ§ek HTTP status ile FE'ye gider.
    const client = await this.clientService.create(tenantId, dto, { userId: req.user.id });
    return { data: client };
  }

  // TEK SEFERLÄ°K BAKIM (admin): Ã¶zellik Ã¶ncesi oluÅŸmuÅŸ eksik mÃ¼vekkillere gÃ¶rev/rozet Ã¼ret.
  // Idempotent; dedupeKey ile mÃ¼kerrer gÃ¶rev oluÅŸmaz.
  @Post('backfill-contact-followup')
  async backfillContactFollowUp(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Bu iÅŸlem yalnÄ±zca admin tarafÄ±ndan yapÄ±labilir');
    }
    return this.clientService.backfillContactFollowUp(req.user.tenantId);
  }

  // MÃ¼vekkil gÃ¼ncelle
  @Put(':id')
  async update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    const tenantId = req.user.tenantId;
    // Task 2: tip/format doÄŸrulamasÄ± (lenient). UpdateClientDto = CreateClientDto + isActive.
    const dto = await this.clientBodyPipe.transform(body, { type: 'body', metatype: UpdateClientDto });
    // P0.4: hata yutma YOK. PR-U4 409 DUPLICATE_IDENTITY (ConflictException) ve 404 NotFound
    // doÄŸrudan gerÃ§ek HTTP status ile FE'ye gider (eski catch HTTP 200 {error} Ã¼retiyordu).
    const client = await this.clientService.update(id, tenantId, dto, { userId: req.user.id });
    return { data: client };
  }

  // MÃ¼vekkil sil
  @Delete(':id')
  async remove(@Request() req: AuthRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    // P0.4: hata yutma YOK â€” bulunamayan kayÄ±t gerÃ§ek HTTP status (404) dÃ¶ner.
    await this.clientService.remove(id, tenantId, { userId: req.user.id });
    return { success: true };
  }
}
