/**
 * Documents API - Document generation and template endpoints
 */

import { apiClient } from './client';

export const documentsApi = {
  // Template Engine
  async getTemplates(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiClient.request<any>(`/template-engine/templates${query}`);
  },

  async getTemplate(id: string) {
    return apiClient.request<any>(`/template-engine/templates/${id}`);
  },

  async createTemplate(data: any) {
    return apiClient.request<any>("/template-engine/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateTemplate(id: string, data: any) {
    return apiClient.request<any>(`/template-engine/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteTemplate(id: string) {
    return apiClient.request<any>(`/template-engine/templates/${id}`, {
      method: "DELETE",
    });
  },

  // Document Generation
  async generateDocument(templateId: string, caseId: string, data?: any) {
    return apiClient.request<any>("/template-engine/generate", {
      method: "POST",
      body: JSON.stringify({ templateId, caseId, ...data }),
    });
  },

  async previewDocument(templateId: string, caseId: string) {
    return apiClient.request<any>("/template-engine/preview", {
      method: "POST",
      body: JSON.stringify({ templateId, caseId }),
    });
  },

  async downloadDocument(documentId: string) {
    return apiClient.requestBlob(`/template-engine/download/${documentId}`);
  },

  // Case Documents
  async getCaseDocuments(caseId: string) {
    return apiClient.request<any>(`/cases/${caseId}/documents`);
  },

  async uploadCaseDocument(caseId: string, formData: FormData) {
    const token = apiClient.getToken();
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/cases/${caseId}/documents`,
      {
        method: "POST",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Dosya yüklenemedi");
    }
    return response.json();
  },

  async deleteCaseDocument(caseId: string, documentId: string) {
    return apiClient.request<any>(`/cases/${caseId}/documents/${documentId}`, {
      method: "DELETE",
    });
  },

  // Form Types
  async getFormTypes(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return apiClient.request<any>(`/form-types${query}`);
  },

  async getFormType(id: string) {
    return apiClient.request<any>(`/form-types/${id}`);
  },
};
