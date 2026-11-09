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
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { buildClientMutationActor } from './client.service';
import {
  CLIENT_SPECIAL_DATA_CATEGORIES,
  ClientSpecialCategoryService,
} from './client-special-category.service';

/**
 * C3-B04 (§13/7) — özel nitelikli veri uçları. Erişim kapısı ve şifreleme servistedir.
 * EXPORT/DOWNLOAD UCU BİLİNÇLİ OLARAK YOKTUR (K7.3 export kontrolü).
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

class CreateSpecialRecordDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  caseId?: string;
  @IsIn(CLIENT_SPECIAL_DATA_CATEGORIES as unknown as string[])
  category!: string;

  @IsString()
  @MaxLength(10000)
  content!: string;
}

class SpecialRecordScopeQuery {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  caseId?: string;
}

@Controller('clients')
// F02-D / J-27: VIEWER yazma reddi — bağlı avukatı PARTNER olsa bile (servis eşiği "ADMIN veya isApproverEligible" rolü okumaz).
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClientSpecialCategoryController {
  constructor(private readonly special: ClientSpecialCategoryService) {}

  @Get(':id/special-category-records')
  list(@Request() req: AuthRequest, @Param('id') id: string,
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) scope: SpecialRecordScopeQuery) {
    return this.special.listRecords({
      tenantId: req.user.tenantId,
      clientId: id,
      actor: actorFrom(req),
      caseId: scope?.caseId,
    });
  }

  @Post(':id/special-category-records')
  create(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) body: CreateSpecialRecordDto,
  ) {
    return this.special.createRecord({
      tenantId: req.user.tenantId,
      clientId: id,
      category: body.category,
      content: body.content,
      actor: actorFrom(req),
      caseId: body.caseId,
    });
  }

  @Get('special-category-records/:recordId')
  read(@Request() req: AuthRequest, @Param('recordId') recordId: string,
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) scope: SpecialRecordScopeQuery) {
    return this.special.readRecord({
      tenantId: req.user.tenantId,
      recordId,
      actor: actorFrom(req),
      caseId: scope?.caseId,
    });
  }
}
