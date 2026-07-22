import { BadRequestException } from '@nestjs/common';

export const CLAIM_ITEM_FORMATION_CONTEXT_REQUIRED_CODE = 'FORMATION_CONTEXT_REQUIRED';
export const CLAIM_ITEM_FORMATION_CONTEXT_REQUIRED_MESSAGE = 'Complete claim formation context is required.';

export function throwClaimItemFormationContextRequired(): never {
  throw new BadRequestException({
    code: CLAIM_ITEM_FORMATION_CONTEXT_REQUIRED_CODE,
    message: CLAIM_ITEM_FORMATION_CONTEXT_REQUIRED_MESSAGE,
  });
}
