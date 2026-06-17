import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ClientIntakePublicService } from './client-intake-public.service';
import { SubmitIntakeDto } from './dto/submit-intake.dto';
import { PublicIntakeRateLimitGuard } from './public-intake-rate-limit.guard';

/**
 * PUBLIC İntake controller (Faz 4.4) — JWT YOK (global guard yok; guard koymuyoruz = public).
 * Yalnız rate-limit guard. tenant/case/client TOKEN kaydından; hiçbir mevcut veri OKUNMAZ.
 *
 * GÜVENLİK: token URL path'inde → bu controller token'ı LOG'LAMAZ. Reverse-proxy
 * access-log'unda path görünebilir → OPS: proxy access-log'unda /public/intake/* path'i
 * maskelenmeli/token kısmı redakte edilmeli (kapsam: altyapı, kod değil).
 */
@Controller('public/intake')
@UseGuards(PublicIntakeRateLimitGuard)
export class ClientIntakePublicController {
  constructor(private readonly service: ClientIntakePublicService) {}

  /** Form şeması (yalnız scope + jenerik başlık, PII yok) — GET /public/intake/:token */
  @Get(':token')
  async getForm(@Param('token') token: string) {
    return this.service.getForm(token);
  }

  /** Submit (CLIENT_SUBMITTED yazar) — POST /public/intake/:token */
  @Post(':token')
  async submit(@Param('token') token: string, @Body() dto: SubmitIntakeDto, @Req() req: Request) {
    const ip = (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown') as string;
    const ua = req.headers['user-agent'];
    return this.service.submit(token, dto, ip, ua);
  }
}
