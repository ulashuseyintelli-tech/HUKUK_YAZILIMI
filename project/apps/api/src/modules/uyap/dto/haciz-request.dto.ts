import { IsEnum, IsNotEmpty, IsNumber, IsObject, IsPositive, IsString } from "class-validator";

export enum HacizTargetTypeDto {
  BANK = "BANK",
  VEHICLE = "VEHICLE",
  PROPERTY = "PROPERTY",
  SALARY = "SALARY",
}

/**
 * I15-D1-R1: haciz talebi için client-facing typed request contract.
 *
 * `caseDebtorId` zorunludur — bir Case'in birden fazla CaseDebtor'u olabildiğinden
 * (owner-ratified: TRIGGER_HACIZ_CASE_DEBTOR_TARGET_UNBOUND), hangi TAM borçlunun
 * hedeflendiği artık istemciden açıkça alınır ve backend'de canonical
 * CaseDebtorLifecycleGuardService ile doğrulanır (bkz. trigger-haciz-authorization.service.ts).
 *
 * `tenantId`/`userId`/`lawyerId`/`clientId` kasıtlı olarak burada YOKTUR — bunlar hiçbir zaman
 * client-supplied authority girdisi değildi; controller bunları yalnız authenticated principal'dan
 * (trusted tenantId param + req.user.id) türetir.
 */
export class PushHacizRequestDto {
  @IsString()
  @IsNotEmpty()
  caseId!: string;

  @IsString()
  @IsNotEmpty()
  caseDebtorId!: string;

  @IsEnum(HacizTargetTypeDto)
  targetType!: HacizTargetTypeDto;

  @IsObject()
  targetDetails!: Record<string, any>;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
