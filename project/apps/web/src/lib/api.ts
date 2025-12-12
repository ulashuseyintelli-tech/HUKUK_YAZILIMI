const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("token", token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      return localStorage.getItem("token");
    }
    return null;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Bir hata oluştu");
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: any; tenant: any }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );
    this.setToken(data.token);
    return data;
  }

  async register(data: {
    firmName: string;
    name: string;
    email: string;
    password: string;
  }) {
    const result = await this.request<{ token: string; user: any; tenant: any }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    this.setToken(result.token);
    return result;
  }

  async me() {
    return this.request<{ user: any }>("/auth/me");
  }

  // Cases
  async getCases(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    return this.request<any>(`/cases?${query}`);
  }

  async getCase(id: string) {
    return this.request<any>(`/cases/${id}`);
  }

  async createCase(data: any) {
    return this.request<any>("/cases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCase(id: string, data: any) {
    return this.request<any>(`/cases/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getCaseStats() {
    return this.request<any>("/cases/stats");
  }

  async getNextFileNumber() {
    const res = await this.request<{ fileNumber: string }>("/cases/next-file-number");
    return res.fileNumber;
  }

  // Debtors
  async getDebtors(params?: { page?: number; limit?: number; search?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.search) query.set("search", params.search);
    return this.request<any>(`/debtors?${query}`);
  }

  async getDebtor(id: string) {
    return this.request<any>(`/debtors/${id}`);
  }

  async createDebtor(data: any) {
    return this.request<any>("/debtors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Tasks
  async getTasks(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.page) query.set("page", params.page.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    return this.request<any>(`/tasks?${query}`);
  }

  async createTask(data: any) {
    return this.request<any>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, data: any) {
    return this.request<any>(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Clients
  async getClients(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<any>(`/clients${query}`);
  }

  async createClient(data: any) {
    return this.request<any>("/clients", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Lawyers
  async getLawyers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<any[]>(`/lawyers${query}`);
  }

  async createLawyer(data: any) {
    return this.request<any>("/lawyers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Debtors - search için güncelleme
  async searchDebtors(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<any>(`/debtors${query}`);
  }

  // Form Types
  async getFormTypes(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return this.request<any[]>(`/form-types${query}`);
  }

  async getFormType(code: string) {
    return this.request<any>(`/form-types/${code}`);
  }

  async getFormTypeCategories() {
    return this.request<string[]>("/form-types/categories");
  }

  async getFrequentFormTypes(limit?: number) {
    const query = limit ? `?limit=${limit}` : "";
    return this.request<any[]>(`/form-types/frequent${query}`);
  }

  // Generic HTTP methods
  async get<T = any>(endpoint: string, options?: { responseType?: "json" | "blob" }): Promise<{ data: T }> {
    if (options?.responseType === "blob") {
      const token = this.getToken();
      const headers: HeadersInit = {
        ...(token && { Authorization: `Bearer ${token}` }),
      };
      const response = await fetch(`${API_URL}/api${endpoint}`, { headers });
      if (!response.ok) {
        throw new Error("İndirme hatası");
      }
      const blob = await response.blob();
      return { data: blob as unknown as T };
    }
    const data = await this.request<T>(endpoint);
    return { data };
  }

  async post<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  // Automation
  async getAutomationStats() {
    return this.request<any>("/automation/stats");
  }

  async toggleAutoMode(caseId: string) {
    return this.request<any>(`/automation/cases/${caseId}/toggle-auto`, {
      method: "POST",
    });
  }

  // AI
  async getAiStats() {
    return this.request<any>("/ai/stats");
  }

  async getAiSuggestions(caseId: string) {
    return this.request<any>(`/ai/case/${caseId}/suggest`);
  }

  async getAiPrediction(caseId: string) {
    return this.request<any>(`/ai/case/${caseId}/predict`);
  }

  // Case Status
  async getStatusList() {
    return this.request<any>("/case-status/list");
  }

  async changeCaseStatus(caseId: string, status: string, reason?: string) {
    return this.request<any>(`/case-status/${caseId}/change`, {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    });
  }

  async getCaseStatusHistory(caseId: string) {
    return this.request<any>(`/case-status/${caseId}/history`);
  }

  // Generic PATCH
  async patch<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  // Generic PUT
  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  // Generic DELETE
  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "DELETE",
    });
    return { data };
  }
}

export const api = new ApiClient();
