import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';

type RecipientDb = Pick<Prisma.TransactionClient, 'clientFinancialDisclosureVersion'>;

export interface DisclosureRecipientOption {
  readonly email: string;
  readonly label: string;
}

export class ClientFinancialDisclosureRecipientError extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      code: 'DISCLOSURE_RECIPIENT_NOT_LINKED',
      message: 'Bildirim alıcısı ilgili müvekkilin iletişim kayıtlarıyla eşleşmiyor.',
    });
  }
}

const RECIPIENT_CONTEXT_SELECT = {
  tenantId: true,
  approvedRecipientEmail: true,
  approvedRecipientPortalUserId: true,
  disclosure: { select: {
    tenantId: true,
    caseId: true,
    caseClient: { select: {
      caseId: true,
      case: { select: { tenantId: true } },
      client: { select: {
        tenantId: true,
        email: true,
        contacts: { where: { type: 'EMAIL' }, select: { value: true, label: true } },
        portalUser: { select: { id: true, email: true, isActive: true } },
      } },
    } },
  } },
} as const;

async function recipientContext(db: RecipientDb, tenantId: string, versionId: string) {
  // Service callers retain their action/actor checks; this is an additional recipient boundary.
  if (typeof tenantId !== 'string' || !tenantId || typeof versionId !== 'string' || !versionId) {
    throw new ClientFinancialDisclosureRecipientError();
  }
  const version = await db.clientFinancialDisclosureVersion.findFirst({
    where: { id: versionId, tenantId },
    select: RECIPIENT_CONTEXT_SELECT,
  });
  const root = version?.disclosure;
  const link = root?.caseClient;
  if (!version || !root || !link || root.tenantId !== tenantId ||
    version.tenantId !== tenantId || link.caseId !== root.caseId ||
    link.case?.tenantId !== tenantId || link.client?.tenantId !== tenantId) {
    throw new ClientFinancialDisclosureRecipientError();
  }
  return version;
}

type RecipientContext = Awaited<ReturnType<typeof recipientContext>>;

function optionsFor(version: RecipientContext): DisclosureRecipientOption[] {
  const client = version.disclosure.caseClient.client;
  const options: DisclosureRecipientOption[] = [];
  const add = (value: string | null, label: string) => {
    const email = value?.trim();
    if (email && isEmail(email) && !options.some(option => option.email === email)) {
      options.push({ email, label });
    }
  };
  for (const contact of client.contacts) add(contact.value, contact.label || 'Müvekkil iletişim kaydı');
  // Retain the existing Client email record; a portal login address alone is not a contact grant.
  add(client.email, 'Müvekkil e-posta kaydı');
  return options;
}

function assertMatch(version: RecipientContext, email: unknown, portalUserId: unknown): void {
  if (typeof email !== 'string' || !optionsFor(version).some(option => option.email === email.trim())) {
    throw new ClientFinancialDisclosureRecipientError();
  }
  if (portalUserId !== undefined && portalUserId !== null) {
    const account = version.disclosure.caseClient.client.portalUser;
    if (typeof portalUserId !== 'string' || !portalUserId || !account?.isActive ||
      account.id !== portalUserId || account.email.trim() !== email.trim()) {
      throw new ClientFinancialDisclosureRecipientError();
    }
  }
}

/** Approval/publication call this with their existing transaction client before writing/claiming. */
export async function assertDisclosureRecipient(
  db: RecipientDb,
  tenantId: string,
  versionId: string,
  email: unknown,
  portalUserId?: unknown,
): Promise<void> {
  assertMatch(await recipientContext(db, tenantId, versionId), email, portalUserId);
}

/** Only the action-scoped office selection endpoint consumes this purpose-bound projection. */
export async function disclosureRecipientSelection(db: RecipientDb, tenantId: string, versionId: string) {
  const version = await recipientContext(db, tenantId, versionId);
  if (version.approvedRecipientEmail !== null) {
    assertMatch(version, version.approvedRecipientEmail, version.approvedRecipientPortalUserId);
  }
  return {
    options: optionsFor(version),
    selectedRecipient: version.approvedRecipientEmail === null ? null : { email: version.approvedRecipientEmail },
  };
}
