import { BadRequestException } from '@nestjs/common';
import { DueType } from '../dto/case.dto';
import {
  assertGenericDueTypeTransition,
  crossesNafakaBoundary,
} from '../due-type-transition.policy';

describe('VER-05 PR-1B Due type transition policy', () => {
  it.each([
    [DueType.NAFAKA, DueType.PRINCIPAL],
    [DueType.NAFAKA, DueType.EXPENSE],
    [DueType.PRINCIPAL, DueType.NAFAKA],
    [DueType.OTHER, DueType.NAFAKA],
  ])('rejects generic boundary transition %s -> %s', (current, requested) => {
    expect(crossesNafakaBoundary(current, requested)).toBe(true);
    expect(() => assertGenericDueTypeTransition(current, requested)).toThrow(BadRequestException);
  });

  it.each([
    [DueType.NAFAKA, DueType.NAFAKA],
    [DueType.PRINCIPAL, DueType.EXPENSE],
    [DueType.OTHER, DueType.PRINCIPAL],
    [DueType.NAFAKA, undefined],
    [DueType.PRINCIPAL, undefined],
  ])('allows same-side or omitted transition %s -> %s', (current, requested) => {
    expect(crossesNafakaBoundary(current, requested)).toBe(false);
    expect(() => assertGenericDueTypeTransition(current, requested)).not.toThrow();
  });
});
