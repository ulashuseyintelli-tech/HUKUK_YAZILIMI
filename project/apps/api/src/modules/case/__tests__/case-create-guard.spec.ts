/**
 * CaseService.create() — userId fail-fast guard testi.
 *
 * INTEREST_POLICY_ASSIGNED (HR-26: HUMAN actor) için userId zorunlu.
 * Guard tx başlamadan çalışır → eksik userId'de hiçbir DB işi yapılmadan reddedilir.
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

describe('CaseService.create() userId guard (fail-fast)', () => {
  // Guard, tx ve hiçbir dependency çağrılmadan ÖNCE çalıştığı için stub yeterli.
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub);

  it('userId yoksa BadRequestException fırlatır (case oluşturmaz)', async () => {
    await expect(service.create('tenant-1', {} as any, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('userId boş string ise de reddeder', async () => {
    await expect(service.create('tenant-1', {} as any, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
