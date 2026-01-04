/**
 * Finance API - Financial operations endpoints
 */

import { apiClient } from './client';

export const financeApi = {
  // Dues (Alacak Kalemleri)
  async getDues(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/dues`);
  },

  async createDue(caseId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/dues`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateDue(caseId: string, dueId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/dues/${dueId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteDue(caseId: string, dueId: string) {
    return apiClient.request<any>(`/cases/${caseId}/dues/${dueId}`, {
      method: "DELETE",
    });
  },

  // Collections (Tahsilatlar)
  async getCollections(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/collections`);
  },

  async createCollection(caseId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/collections`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCollection(caseId: string, collectionId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/collections/${collectionId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteCollection(caseId: string, collectionId: string) {
    return apiClient.request<any>(`/cases/${caseId}/collections/${collectionId}`, {
      method: "DELETE",
    });
  },

  // Expenses (Masraflar)
  async getExpenses(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/expenses`);
  },

  async createExpense(caseId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/expenses`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateExpense(caseId: string, expenseId: string, data: any) {
    return apiClient.request<any>(`/cases/${caseId}/expenses/${expenseId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteExpense(caseId: string, expenseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/expenses/${expenseId}`, {
      method: "DELETE",
    });
  },

  // Expense Requests
  async getExpenseRequests(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    return apiClient.request<any>(`/expense-requests?${query}`);
  },

  async createExpenseRequest(data: any) {
    return apiClient.request<any>("/expense-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async approveExpenseRequest(id: string) {
    return apiClient.request<any>(`/expense-requests/${id}/approve`, {
      method: "POST",
    });
  },

  async rejectExpenseRequest(id: string, reason: string) {
    return apiClient.request<any>(`/expense-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  // Cost Packages
  async getCostPackages() {
    return apiClient.request<any>("/cost-packages");
  },

  async getCostPackage(id: string) {
    return apiClient.request<any>(`/cost-packages/${id}`);
  },

  async createCostPackage(data: any) {
    return apiClient.request<any>("/cost-packages", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async applyCostPackage(caseId: string, packageId: string) {
    return apiClient.request<any>(`/cases/${caseId}/apply-cost-package`, {
      method: "POST",
      body: JSON.stringify({ packageId }),
    });
  },

  // Case Balance
  async getCaseBalance(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/balance`);
  },

  async getCaseFinancialSummary(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/financial-summary`);
  },

  // Payment Instructions
  async getPaymentInstructions(caseId: string) {
    return apiClient.request<any>(`/payment-instructions/case/${caseId}`);
  },

  async createPaymentInstruction(data: any) {
    return apiClient.request<any>("/payment-instructions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updatePaymentInstruction(id: string, data: any) {
    return apiClient.request<any>(`/payment-instructions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async executePaymentInstruction(id: string) {
    return apiClient.request<any>(`/payment-instructions/${id}/execute`, {
      method: "POST",
    });
  },

  // Banks
  async getBanks() {
    return apiClient.request<any>("/banks");
  },

  async getBankAccounts() {
    return apiClient.request<any>("/bank-accounts");
  },

  async createBankAccount(data: any) {
    return apiClient.request<any>("/bank-accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Summary Engine (Hesap Özeti)
  async generateSummary(caseId: string, options?: any) {
    return apiClient.request<any>(`/summary-engine/case/${caseId}/generate`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    });
  },

  async getSummaryHistory(caseId: string) {
    return apiClient.request<any>(`/summary-engine/case/${caseId}/history`);
  },

  async downloadSummary(summaryId: string) {
    return apiClient.requestBlob(`/summary-engine/${summaryId}/download`);
  },
};
