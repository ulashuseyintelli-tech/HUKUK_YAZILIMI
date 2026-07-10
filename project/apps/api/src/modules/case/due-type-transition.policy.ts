import { BadRequestException } from '@nestjs/common';
import { DueType } from './dto/case.dto';

export function crossesNafakaBoundary(current: DueType, requested?: DueType): boolean {
  if (requested === undefined) return false;
  return (current === DueType.NAFAKA) !== (requested === DueType.NAFAKA);
}

export function assertGenericDueTypeTransition(current: DueType, requested?: DueType): void {
  if (!crossesNafakaBoundary(current, requested)) return;

  throw new BadRequestException(
    'NAFAKA ile diğer Due türleri arasında generic güncelleme yapılamaz. Ayrı ve owner-authorized dönüşüm komutu gerekir.',
  );
}
