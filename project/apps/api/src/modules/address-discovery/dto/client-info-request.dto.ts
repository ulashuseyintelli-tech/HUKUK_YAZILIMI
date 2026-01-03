import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { ClientInfoRequestStatus } from '@prisma/client';

export class CreateClientInfoRequestDto {
  @IsString()
  caseId: string;

  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  debtorId?: string;

  @IsEmail()
  emailTo: string;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsString()
  emailBody?: string;
}

export class UpdateClientInfoRequestDto {
  @IsOptional()
  @IsEnum(ClientInfoRequestStatus)
  status?: ClientInfoRequestStatus;

  @IsOptional()
  @IsString()
  responseNotes?: string;
}

export class ClientInfoRequestResponseDto {
  id: string;
  caseId: string;
  clientId: string;
  debtorId?: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  status: ClientInfoRequestStatus;
  sentAt: Date;
  respondedAt?: Date;
  responseNotes?: string;
  reminderSentAt?: Date;
  reminderCount: number;
  createdAt: Date;
  updatedAt: Date;
  client?: {
    id: string;
    displayName: string;
  };
  debtor?: {
    id: string;
    name: string;
  };
}
