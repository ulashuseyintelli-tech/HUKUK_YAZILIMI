import { apiClient } from './client';

export interface ClientBankAccountView {
  id: string;
  bankName: string;
  branchName: string | null;
  accountHolder: string | null;
  ibanMasked: string;
  isPrimary: boolean;
}
export interface ClientBankAccountInput {
  bankName: string;
  branchName?: string | null;
  accountHolder?: string | null;
  iban: string;
  isPrimary?: boolean;
}
export interface ClientBankAccountList {
  items: ClientBankAccountView[];
  capabilities: { canCreate: boolean; canUpdate: boolean; reasonCode: string };
}
const path = (clientId: string) => `/clients/${encodeURIComponent(clientId)}/bank-accounts`;
export const clientBankAccountsApi = {
  async list(clientId: string): Promise<ClientBankAccountList> {
    return (await apiClient.get<ClientBankAccountList>(path(clientId))).data;
  },
  async create(clientId: string, body: ClientBankAccountInput): Promise<ClientBankAccountView> {
    return (await apiClient.post<ClientBankAccountView>(path(clientId), body)).data;
  },
  async update(clientId: string, accountId: string, body: Partial<ClientBankAccountInput>): Promise<ClientBankAccountView> {
    return (await apiClient.put<ClientBankAccountView>(`${path(clientId)}/${encodeURIComponent(accountId)}`, body)).data;
  },
};
