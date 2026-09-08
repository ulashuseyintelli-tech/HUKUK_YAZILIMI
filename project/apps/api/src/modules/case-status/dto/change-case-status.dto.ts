import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LegalCaseStatus } from '@prisma/client';

/**
 * OFFICE-A07 — `POST /case-status/:caseId/change` gövde sözleşmesi.
 *
 * NEDEN TIPLI DTO: gövde daha önce satır-içi TypeScript tip literali ile tipliydi. Tip
 * runtime'da SILINIR ve global `ValidationPipe` ({ whitelist, forbidNonWhitelisted })
 * metatype `Object` gördüğünde HİÇ çalışmaz — yani gövde hiç doğrulanmıyordu. (Aynı kusur
 * sınıfı staff'ta F-B03-03, avukat create'inde F-B01-05 olarak kapatıldı.)
 *
 * ASIL AMAÇ — SAHTE YÜRÜTME KANITI ÜRETİLEMEZ: `approvalRequestId` ve `approvalAttempt`
 * bu DTO'da **BİLEREK YOKTUR**. `forbidNonWhitelisted: true` olduğu için istemci onları
 * göndermeye kalkarsa istek **400** ile reddedilir. Controller da bu alanları servise
 * GEÇİRMEZ; bağ yalnız güvenilir executor bağlamından, ayrı bir servis parametresiyle
 * yazılır. Böylece koruma HEM DTO sınırında HEM servis imzasında iki katlıdır.
 *
 * MEVCUT DAVRANIŞ KORUNUR: `userId` ve `confirmationToken` bugün de gövdede geliyor
 * (`userId` zaten YOK SAYILIYOR — truthful actor `@CurrentUser('id')`'dan gelir). DTO
 * onları TANIR ki mevcut çağıranlar 400 almasın; ama controller yalnız `status` ve
 * `reason`'ı kullanır — tanınmak persist edilmek DEĞİLDİR.
 */
export class ChangeCaseStatusDto {
  @IsEnum(LegalCaseStatus)
  status: LegalCaseStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  /** @deprecated OTORİTER DEĞİL — truthful actor `@CurrentUser('id')`'dan gelir; yok sayılır. */
  @IsOptional()
  @IsString()
  userId?: string;

  /** P3-2C: yalnız confirm-gate açıkken anlamlı; default OFF → yok sayılır. */
  @IsOptional()
  @IsString()
  confirmationToken?: string;
}
