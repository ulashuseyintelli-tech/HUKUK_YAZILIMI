/**
 * Automation API - Automation, AI, and reporting endpoints
 */

import { apiClient } from './client';

export const automationApi = {
  // Automation Stats
  async getAutomationStats() {
    return apiClient.request<any>('/automation/stats');
  },

  async getAutomationRules() {
    return apiClient.request<any>('/automation/rules');
  },

  async createAutomationRule(data: any) {
    return apiClient.request<any>('/automation/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAutomationRule(id: string, data: any) {
    return apiClient.request<any>(`/automation/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteAutomationRule(id: string) {
    return apiClient.request<any>(`/automation/rules/${id}`, { method: 'DELETE' });
  },

  async triggerAutomation(caseId: string, ruleId: string) {
    return apiClient.request<any>(`/automation/trigger`, {
      method: 'POST',
      body: JSON.stringify({ caseId, ruleId }),
    });
  },

  // Stage Triggers
  async getStageTriggers() {
    return apiClient.request<any>('/stage-triggers');
  },

  async createStageTrigger(data: any) {
    return apiClient.request<any>('/stage-triggers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateStageTrigger(id: string, data: any) {
    return apiClient.request<any>(`/stage-triggers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteStageTrigger(id: string) {
    return apiClient.request<any>(`/stage-triggers/${id}`, { method: 'DELETE' });
  },

  // AI
  async getAiStats() {
    return apiClient.request<any>('/ai/stats');
  },

  async getAiSuggestions(caseId: string) {
    return apiClient.request<any>(`/ai/case/${caseId}/suggestions`);
  },

  async getAiPrediction(caseId: string) {
    return apiClient.request<any>(`/ai/case/${caseId}/prediction`);
  },

  // Tasks
  async getTasks(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    return apiClient.request<any>(`/tasks?${query}`);
  },

  async getTask(id: string) {
    return apiClient.request<any>(`/tasks/${id}`);
  },

  async createTask(data: any) {
    return apiClient.request<any>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTask(id: string, data: any) {
    return apiClient.request<any>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async completeTask(id: string) {
    return apiClient.request<any>(`/tasks/${id}/complete`, { method: 'POST' });
  },

  // Reports
  async getReportTypes() {
    return apiClient.request<any>('/reports/types');
  },

  async generateReport(type: string, params: any) {
    return apiClient.request<any>('/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ type, ...params }),
    });
  },

  async getReportHistory() {
    return apiClient.request<any>('/reports/history');
  },

  async downloadReport(reportId: string) {
    return apiClient.requestBlob(`/reports/${reportId}/download`);
  },

  // E-Sign
  async getESignStatus(documentId: string) {
    return apiClient.request<any>(`/e-sign/${documentId}/status`);
  },

  async initiateESign(documentId: string, signers: any[]) {
    return apiClient.request<any>('/e-sign/initiate', {
      method: 'POST',
      body: JSON.stringify({ documentId, signers }),
    });
  },

  async cancelESign(documentId: string) {
    return apiClient.request<any>(`/e-sign/${documentId}/cancel`, { method: 'POST' });
  },

  // Message Templates
  async getMessageTemplates(type?: string) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return apiClient.request<any>(`/message-templates${query}`);
  },

  async createMessageTemplate(data: any) {
    return apiClient.request<any>('/message-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMessageTemplate(id: string, data: any) {
    return apiClient.request<any>(`/message-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteMessageTemplate(id: string) {
    return apiClient.request<any>(`/message-templates/${id}`, { method: 'DELETE' });
  },

  async sendMessage(templateId: string, recipients: any[], variables?: any) {
    return apiClient.request<any>('/message-templates/send', {
      method: 'POST',
      body: JSON.stringify({ templateId, recipients, variables }),
    });
  },
};
