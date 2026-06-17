import { IsString, MinLength } from 'class-validator';

/** Promote gövdesi — onaylı soft-intel alanlar bu borçluya işlenir (F46-K1: debtorId body'de). */
export class PromoteSubmissionDto {
  @IsString()
  @MinLength(1)
  debtorId: string;
}
