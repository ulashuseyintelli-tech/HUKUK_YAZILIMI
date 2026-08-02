import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query, NotFoundException, ValidationPipe, Headers, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientIntakeLinkService } from '../client-intake-link/client-intake-link.service';
import { PoaService, validatePoaUploadFile } from '../poa/poa.service';
import { CreateClientWorkspaceIntakeLinkDto } from '../client-intake-link/dto/client-intake-link.dto';
import { buildClientMutationActor, CLIENT_DOCUMENT_REQUEST_CODES, CLIENT_TEMPLATE_NOTIFICATION_CODES, ClientService, type ClientDocumentRequestCode, type ClientTemplateNotificationCode } from './client.service';
import { CreateClientDto, UpdateClientDto } from './dto/create-client.dto';

/** C0-a: actor compile-time shape â€” req.user JWT validate'ten gelen User; id+tenantId auth context. */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

class SendClientWorkspaceTemplateNotificationDto {
  @IsIn(CLIENT_TEMPLATE_NOTIFICATION_CODES)
  templateCode!: ClientTemplateNotificationCode;

  @IsString()
  @IsOptional()
  caseId?: string;
}

class SendClientWorkspaceDocumentRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(CLIENT_DOCUMENT_REQUEST_CODES, { each: true })
  documentCodes!: ClientDocumentRequestCode[];

  @IsString()
  @IsOptional()
  caseId?: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(
    private clientService: ClientService,
    private clientIntakeLinkService: ClientIntakeLinkService,
    private poaService?: PoaService,
  ) {}

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

  private readonly templateNotificationBodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  private readonly documentRequestBodyPipe = new ValidationPipe({
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

  // Client Workspace POA reminder manual typed command
  @Post(':clientId/poa-reminders/send')
  async sendPoaReminder(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
  ) {
    const result = await this.clientService.sendPoaReminder(clientId, req.user.tenantId);
    return { data: result };
  }

  // Client Workspace template notification manual typed command
  @Post(':clientId/template-notifications/send')
  async sendTemplateNotification(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: any,
  ) {
    const dto = await this.templateNotificationBodyPipe.transform(body, { type: 'body', metatype: SendClientWorkspaceTemplateNotificationDto });
    const result = await this.clientService.sendTemplateNotification(
      clientId,
      req.user.tenantId,
      req.user.id,
      idempotencyKey,
      dto as SendClientWorkspaceTemplateNotificationDto,
    );
    return { data: result };
  }

  // Client Workspace document request manual typed command
  @Post(':clientId/document-requests/send')
  async sendDocumentRequest(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: any,
  ) {
    const dto = await this.documentRequestBodyPipe.transform(body, { type: 'body', metatype: SendClientWorkspaceDocumentRequestDto });
    const result = await this.clientService.sendDocumentRequest(
      clientId,
      req.user.tenantId,
      req.user.id,
      idempotencyKey,
      dto as SendClientWorkspaceDocumentRequestDto,
    );
    return { data: result };
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


  // Client Workspace POA file upload safe endpoint (client-scoped response; raw filePath yok)
  @Post(':clientId/poas/:poaId/file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPoaFile(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('poaId') poaId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    validatePoaUploadFile(file);
    const result = await this.poaService!.uploadFileForClientWorkspace(clientId, poaId, file, req.user.tenantId);
    return { data: result };
  }

  /**
   * ACT-11 (2026-07-05) — FE'nin "Pasifleştir" butonunu gizlemesi için salt-okunur
   * eligibility sinyali. GERÇEK yetki uygulaması hâlâ ClientService.remove()/update()
   * içindeki assertCanManageLifecycle()'da (DEĞİŞMEDİ) — FE bu sonuca güvenip
   * authorization'ı kendi başına uygulamıyor (defense-in-depth korunuyor).
   * `:id` route'undan ÖNCE tanımlı olmalı (aksi halde Nest bunu id parametresi sanır).
   *
   * @remarks Çağrıldığı yerler:
   * - (yeni) Client Ayarlar sayfası → GET /clients/lifecycle-eligibility (Pasifleştir buton gate)
   */
  @Get('lifecycle-eligibility')
  async lifecycleEligibility(@Request() req: AuthRequest) {
    const eligible = await this.clientService.canManageLifecycle(req.user.id, req.user.tenantId);
    // OWN-13 I01: ADDITIVE genişletme — mevcut `eligible` alanı AYNEN korunur (geriye
    // uyumluluk; ACT-11 tüketicisi bozulmaz). `capabilities` FE'nin create/edit kontrollerini
    // disabled+gerekçeli göstermesi içindir; API enforcement authority olarak KALIR.
    const capabilities = await this.clientService.getMutationCapabilities(
      req.user.id,
      req.user.tenantId,
      (req.user as { role?: string | null }).role,
    );
    return { data: { eligible, capabilities } };
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
    // OWN-13 I01: actor'a `role` de geçilir — C0-a ile AYNI kural, YALNIZ auth context'ten.
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId, role: req.user.role });
    // OWN-13 I01 (owner D01): route sınırında yetki kapısı — HER ŞEYDEN ÖNCE.
    // OWN-13 I02-R1: kapı ARTIK `ClientService.create()` içinde de authority olarak çalışır;
    // buradaki çağrı DEFENSE-IN-DEPTH olarak korunur. İş mantığı TEKRARLANMAZ — her iki yol
    // da AYNI merkezi `client-mutation-policy`yi kullanır (owner req. 4).
    this.clientService.assertCanCreateClient(actor);
    const client = await this.clientService.create(tenantId, dto, actor);
    return { data: client };
  }

  // TEK SEFERLÄ°K BAKIM (admin): Ã¶zellik Ã¶ncesi oluÅŸmuÅŸ eksik mÃ¼vekkillere gÃ¶rev/rozet Ã¼ret.
  // Idempotent; dedupeKey ile mÃ¼kerrer gÃ¶rev oluÅŸmaz.
  @Post('backfill-contact-followup')
  async backfillContactFollowUp(@Request() req: any) {
    // OWN-13 I02-R3 (owner D06): elle yazılmış `role==='ADMIN'` kontrolü KALDIRILDI — karar
    // artık ClientService.assertCanRunElevatedClientBulkOperation ile SERVİS SINIRINDA
    // verilir (D04 ile AYNI elevated eşiği; ADMIN tek başına yetmez).
    const tenantId = req.user.tenantId;
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId, role: req.user.role });
    return this.clientService.backfillContactFollowUp(tenantId, actor);
  }

  // MÃ¼vekkil gÃ¼ncelle
  @Put(':id')
  async update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    const tenantId = req.user.tenantId;
    // Task 2: tip/format doÄŸrulamasÄ± (lenient). UpdateClientDto = CreateClientDto + isActive.
    const dto = await this.clientBodyPipe.transform(body, { type: 'body', metatype: UpdateClientDto });
    // P0.4: hata yutma YOK. PR-U4 409 DUPLICATE_IDENTITY (ConflictException) ve 404 NotFound
    // doÄŸrudan gerÃ§ek HTTP status ile FE'ye gider (eski catch HTTP 200 {error} Ã¼retiyordu).
    // OWN-13 I01: actor'a `role` de geçilir — C0-a ile AYNI kural, YALNIZ auth context'ten.
    const actor = buildClientMutationActor({ userId: req.user.id, tenantId, role: req.user.role });
    // OWN-13 I01 (owner D02): coarse + hassas-alan kapısı — HER ŞEYDEN ÖNCE. Karma istekte
    // TAMAMI hassas sayılır (partial update YOK). Lifecycle kapısı (assertCanManageLifecycle)
    // servis içinde, kendi yerinde AYNEN korunur; bu kapı onu ne gevşetir ne değiştirir.
    // OWN-13 I02-R1: `ClientService.update()` de aynı kapıyı çalıştırır → defense-in-depth.
    await this.clientService.assertCanUpdateClient(tenantId, dto, actor);
    const client = await this.clientService.update(id, tenantId, dto, actor);
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
