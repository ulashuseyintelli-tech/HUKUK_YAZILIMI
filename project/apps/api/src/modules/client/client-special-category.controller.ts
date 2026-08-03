import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  @IsIn(CLIENT_SPECIAL_DATA_CATEGORIES as unknown as string[])
  category!: string;

  @IsString()
  @MaxLength(10000)
  content!: string;
}

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientSpecialCategoryController {
  constructor(private readonly special: ClientSpecialCategoryService) {}

  @Get(':id/special-category-records')
  list(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.special.listRecords({
      tenantId: req.user.tenantId,
      clientId: id,
      actor: actorFrom(req),
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
    });
  }

  @Get('special-category-records/:recordId')
  read(@Request() req: AuthRequest, @Param('recordId') recordId: string) {
    return this.special.readRecord({
      tenantId: req.user.tenantId,
      recordId,
      actor: actorFrom(req),
    });
  }
}
