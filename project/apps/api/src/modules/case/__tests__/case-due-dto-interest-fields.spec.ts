import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DueDto, DueType, InterestType } from '../dto/case.dto';

describe('DueDto faiz alanlari', () => {
  it('create-case DueDto interestType/rate/start/end/amount alanlarini kabul eder', async () => {
    const dto = plainToInstance(DueDto, {
      type: DueType.PRINCIPAL,
      description: 'Ana alacak',
      amount: 1000,
      dueDate: '2026-01-01',
      interestType: InterestType.YASAL,
      interestRate: 24,
      interestStartDate: '2026-01-02',
      interestEndDate: '2026-02-02',
      interestAmount: 123.45,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
