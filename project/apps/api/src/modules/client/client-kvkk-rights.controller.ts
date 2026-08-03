import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { buildClientMutationActor } from './client.service';
import {
  CLIENT_DISCLOSURE_DELIVERY_METHODS,
  ClientDisclosureService,
  type ClientDisclosureDeliveryMethod,
} from './client-disclosure.service';
import {
  CLIENT_DSAR_CHANNELS,
  CLIENT_DSAR_TYPES,
  ClientDataSubjectRequestService,
  type ClientDsarChannel,
  type ClientDsarType,
} from './client-data-subject-request.service';

/**
 * C3-B02 (§13/6) — aydınlatma + ilgili kişi başvurusu uçları (OFİS kanalı).
 * Yetki eşikleri servis katmanında mevcut primitive'lerle uygulanır.
 */
interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

const actorFrom = (req: AuthRequest) =>
  buildClientMutationActor({
    userId: req.user.id,
    tenantId: req.user.tenantId,
    role: req.user.role,
  });

class CreateDisclosureTextDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

class RecordDisclosureDeliveryDto {
  @IsString()
  disclosureTextId!: string;

  @IsIn(CLIENT_DISCLOSURE_DELIVERY_METHODS as unknown as string[])
  method!: ClientDisclosureDeliveryMethod;

  @IsDateString()
  deliveredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class CreateDsarDto {
  @IsIn(CLIENT_DSAR_TYPES as unknown as string[])
  type!: ClientDsarType;

  @IsIn(CLIENT_DSAR_CHANNELS as unknown as string[])
  channel!: ClientDsarChannel;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

class DsarAssignDto {
  @IsString()
  assignedToUserId!: string;
}

class DsarRespondDto {
  @IsString()
  @MaxLength(5000)
  responseNote!: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientKvkkRightsController {
  constructor(
    private readonly disclosure: ClientDisclosureService,
    private readonly dsar: ClientDataSubjectRequestService,
  ) {}

  // ---- Aydınlatma (K6.1) -----------------------------------------------------------------

  @Get('disclosure-texts')
  listTexts(@Request() req: AuthRequest) {
    return this.disclosure.listTexts(req.user.tenantId);
  }

  @Post('disclosure-texts')
  createText(
    @Request() req: AuthRequest,
    @Body(new ValidationPipe({ whitelist: true })) body: CreateDisclosureTextDto,
  ) {
    return this.disclosure.createTextVersion({
      tenantId: req.user.tenantId,
      actor: actorFrom(req),
      content: body.content,
      title: body.title,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
    });
  }

  @Get(':id/disclosure-deliveries')
  listDeliveries(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.disclosure.listDeliveries(req.user.tenantId, id);
  }

  @Post(':id/disclosure-deliveries')
  recordDelivery(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: RecordDisclosureDeliveryDto,
  ) {
    return this.disclosure.recordDelivery({
      tenantId: req.user.tenantId,
      clientId: id,
      disclosureTextId: body.disclosureTextId,
      method: body.method,
      deliveredAt: new Date(body.deliveredAt),
      actor: actorFrom(req),
      note: body.note,
    });
  }

  // ---- İlgili kişi başvurusu (K6.2-K6.5) ---------------------------------------------------

  @Get('data-subject-requests')
  listRequests(
    @Request() req: AuthRequest,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ) {
    return this.dsar.listRequests({
      tenantId: req.user.tenantId,
      actor: actorFrom(req),
      clientId,
      status,
    });
  }

  @Post(':id/data-subject-requests')
  createRequest(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: CreateDsarDto,
  ) {
    return this.dsar.createRequest({
      tenantId: req.user.tenantId,
      clientId: id,
      type: body.type,
      channel: body.channel,
      receivedAt: new Date(body.receivedAt),
      actor: actorFrom(req),
      summary: body.summary,
      assignedToUserId: body.assignedToUserId,
    });
  }

  @Post('data-subject-requests/:requestId/start-review')
  startReview(@Request() req: AuthRequest, @Param('requestId') requestId: string) {
    return this.dsar.startReview({
      tenantId: req.user.tenantId,
      requestId,
      actor: actorFrom(req),
    });
  }

  @Post('data-subject-requests/:requestId/assign')
  assign(
    @Request() req: AuthRequest,
    @Param('requestId') requestId: string,
    @Body(new ValidationPipe({ whitelist: true })) body: DsarAssignDto,
  ) {
    return this.dsar.assign({
      tenantId: req.user.tenantId,
      requestId,
      assignedToUserId: body.assignedToUserId,
      actor: actorFrom(req),
    });
  }

  @Post('data-subject-requests/:requestId/respond')
  respond(
    @Request() req: AuthRequest,
    @Param('requestId') requestId: string,
    @Body(new ValidationPipe({ whitelist: true })) body: DsarRespondDto,
  ) {
    return this.dsar.respond({
      tenantId: req.user.tenantId,
      requestId,
      responseNote: body.responseNote,
      actor: actorFrom(req),
    });
  }
}
