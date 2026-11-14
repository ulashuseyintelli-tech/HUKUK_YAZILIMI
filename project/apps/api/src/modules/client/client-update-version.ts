import { BadRequestException, ConflictException } from '@nestjs/common';

/** Callers: ClientService.assertCanUpdateClient/update. Transport metadata grants no field authority. */
export function clientUpdateBusinessPayload(data: Record<string, unknown> | null | undefined) {
  const { expectedVersion: _expectedVersion, ...payload } = data ?? {};
  return payload;
}

/** Caller: ClientService.update; direct service entries share the HTTP precondition. */
export function requireClientUpdateVersion(data: Record<string, unknown> | null | undefined): number {
  const value = data?.expectedVersion;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new BadRequestException({
      code: 'CLIENT_VERSION_REQUIRED',
      message: 'Geçerli müvekkil sürümü gerekli; güncel kaydı yeniden yükleyin.',
    });
  }
  return value;
}

/** Caller: ClientService.update, for stale preflight, conditional write or locked no-op. */
export function clientVersionConflict(): ConflictException {
  return new ConflictException({
    code: 'CLIENT_VERSION_CONFLICT',
    message: 'Bu kayıt başka bir işlemde değişti. Taslağınızı koruyup güncel kaydı yeniden yükleyin.',
  });
}
