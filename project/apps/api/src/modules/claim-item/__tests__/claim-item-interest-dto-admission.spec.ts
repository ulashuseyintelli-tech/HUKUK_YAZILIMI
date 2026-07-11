import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateClaimItemDto, UpdateClaimItemDto } from '../dto/claim-item.dto';

describe('PR-A2 ClaimItem public DTO admission', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('rich code kabul eder ve unknown kodu reddeder', async () => {
    await expect(pipe.transform({
      caseId: 'case-1', itemType: 'PRINCIPAL', amount: 1000,
      interestTypeCode: 'LEGAL_3095', interestRate: null,
    }, { type: 'body', metatype: CreateClaimItemDto })).resolves.toMatchObject({
      interestTypeCode: 'LEGAL_3095', interestRate: null,
    });

    await expect(pipe.transform({
      caseId: 'case-1', itemType: 'PRINCIPAL', amount: 1000,
      interestTypeCode: 'UNKNOWN',
    }, { type: 'body', metatype: CreateClaimItemDto })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['noInterestConfirmedById', 'noInterestConfirmedAt'])(
    'client-controlled %s alanini whitelist ile reddeder',
    async (field) => {
      await expect(pipe.transform({
        interestAccrualStatus: 'NO_INTEREST',
        noInterestReason: 'faiz yok',
        [field]: field.endsWith('At') ? '2026-01-01T00:00:00Z' : 'spoof-user',
      }, { type: 'body', metatype: UpdateClaimItemDto })).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
