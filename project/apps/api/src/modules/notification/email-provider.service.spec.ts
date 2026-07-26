import { ConfigService } from '@nestjs/config';
import { EmailProviderService } from './email-provider.service';

type EmailValidator = {
  isValidEmail(email: unknown): boolean;
};

function validator(): EmailValidator {
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  return new EmailProviderService(config) as unknown as EmailValidator;
}

describe('EmailProviderService email validation', () => {
  it.each([
    'user@example.com',
    'first.last+tag@example.co.uk',
    'a@b.c',
    'a@b..c',
    'a@b..',
  ])('accepts the existing valid-address contract: %s', (email) => {
    expect(validator().isValidEmail(email)).toBe(true);
  });

  it.each([
    '',
    'user.example.com',
    '@example.com',
    'user@.com',
    'user@example',
    'user@example.',
    'user@@example.com',
    'user name@example.com',
    'user@example .com',
  ])('rejects malformed addresses without a backtracking regex: %s', (email) => {
    expect(validator().isValidEmail(email)).toBe(false);
  });

  it('fails closed for a non-string runtime value', () => {
    expect(validator().isValidEmail(null)).toBe(false);
  });
});
