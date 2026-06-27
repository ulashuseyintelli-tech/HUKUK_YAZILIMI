import type { InstrumentChain, ChainAnalysis } from "./instrument-chain";
import { buildResponsibilityAtPath, type CombinedResponsibilityResult } from "./responsibility-at";
import { buildResponsibilityHistoryPath, type ResponsibilityHistoryResult, type ResponsibilityHistoryParams } from "./responsibility-history";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Debug: Log API URL on client side
if (typeof window !== "undefined") {
  console.log("[API] Base URL:", API_URL);
}

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

    try {
      const response = await fetch(`${API_URL}/api${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // PR-D: hata gövdesini KORU (code/candidates gibi yapısal alanlar) — review akışları için.
        const e = new Error(error.message || "Bir hata oluştu") as any;
        e.body = error;
        e.status = response.status;
        throw e;
      }

      return response.json();
    } catch (err: any) {
      // Network hatası - API'ye bağlanılamıyor
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        throw new Error('API sunucusuna bağlanılamıyor. Lütfen API\'nin çalıştığından emin olun (http://localhost:8080). Terminalde "pnpm run dev" komutunu çalıştırın.');
      }
      // ERR_CONNECTION_REFUSED
      if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('ECONNREFUSED')) {
        throw new Error('API sunucusu yanıt vermiyor. Lütfen API\'yi yeniden başlatın.');
      }
      throw err;
    }
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

  // K1-7: davet kabul — ham token + kullanıcının belirlediği parola. Auth gerekmez.
  async acceptInvite(token: string, password: string) {
    return this.request<{ ok: boolean; userId: string }>("/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  }

  // K1-7-4: admin login-davet yönetimi (self-service). Tümü ADMIN + JWT gerektirir
  // (backend: JwtAuthGuard + AdminGuard + LOGIN_INVITE_PROVISIONING_ENABLED). Ham token
  // asla bu yanıtlarda dönmez; e-posta backend tarafından otomatik gönderilir.
  async createInvite(data: { email: string; name: string; surname?: string; role?: string }) {
    return this.request<{ inviteId: string; userId: string; email: string; expiresAt: string }>(
      "/auth/invites",
      { method: "POST", body: JSON.stringify(data) }
    );
  }

  async listInvites(status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return this.request<
      Array<{
        inviteId: string;
        userId: string;
        email: string;
        expiresAt: string;
        createdAt: string;
        consumed: boolean;
        revoked: boolean;
      }>
    >(`/auth/invites${query}`);
  }

  async resendInvite(inviteId: string) {
    return this.request<{ inviteId: string; expiresAt: string }>(
      `/auth/invites/${inviteId}/resend`,
      { method: "POST" }
    );
  }

  async revokeInvite(inviteId: string) {
    return this.request<{ inviteId: string; revoked: boolean }>(
      `/auth/invites/${inviteId}/revoke`,
      { method: "POST" }
    );
  }

  // Cases
  async getCases(params?: { status?: string; clientId?: string; noOwner?: boolean; legalResponsibleMissing?: boolean; responsibleLawyerId?: string; responsibleStaffId?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.clientId) query.set("clientId", params.clientId);
    if (params?.noOwner) query.set("noOwner", "1"); // SAHIPSIZ-DOSYALAR-G1
    if (params?.legalResponsibleMissing) query.set("legalResponsibleMissing", "1"); // WP-3a
    // M2-G5d-1b: gerçek kişi owner filtresi (server-side; backend G5a hazır). K1 bridge yok → cross-map yok.
    if (params?.responsibleLawyerId) query.set("responsibleLawyerId", params.responsibleLawyerId);
    if (params?.responsibleStaffId) query.set("responsibleStaffId", params.responsibleStaffId);
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

  // A2-min/A3 — OCR extraction feedback (PII'siz telemetri). Fire-and-forget caller'da .catch ile çağrılır.
  async recordOcrExtractionFeedback(payload: any) {
    return this.request<{ success: boolean; recorded: number }>("/ocr/extraction-feedback", {
      method: "POST",
      body: JSON.stringify(payload),
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

  // Case Lawyers
  async getCaseLawyers(caseId: string) {
    return this.request<any>(`/cases/${caseId}/lawyers`);
  }

  async addCaseLawyer(caseId: string, data: {
    lawyerId: string;
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
  }) {
    return this.request<any>(`/cases/${caseId}/lawyers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async removeCaseLawyer(caseId: string, caseLawyerId: string) {
    return this.request<any>(`/cases/${caseId}/lawyers/${caseLawyerId}`, {
      method: "DELETE",
    });
  }

  async updateCaseLawyer(caseId: string, caseLawyerId: string, data: {
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
    casePermissions?: {
      canEditCase?: boolean;
      canGenerateDocs?: boolean;
      canSyncUYAP?: boolean;
      canViewFinance?: boolean;
      canEditFinance?: boolean;
      canChangeStatus?: boolean;
      canEditParties?: boolean;
    };
    receiveNotifications?: boolean;
  }) {
    return this.request<any>(`/cases/${caseId}/lawyers/${caseLawyerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Case Staff
  async getCaseStaff(caseId: string) {
    return this.request<any>(`/cases/${caseId}/staff`);
  }

  async addCaseStaff(caseId: string, data: {
    staffMemberId: string;
    roleOnCase?: string;
  }) {
    return this.request<any>(`/cases/${caseId}/staff`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async removeCaseStaff(caseId: string, caseStaffId: string) {
    return this.request<any>(`/cases/${caseId}/staff/${caseStaffId}`, {
      method: "DELETE",
    });
  }

  // WP-1d-4a: read-only temporal sorumluluk (asOf tarihinde owner + hukuki sorumlu avukat).
  async getCaseResponsibilityAt(caseId: string, asOf?: string) {
    return this.request<CombinedResponsibilityResult>(buildResponsibilityAtPath(caseId, asOf));
  }

  // WP-1d-4c-2: read-only sorumluluk değişim geçmişi (timeline).
  async getCaseResponsibilityHistory(caseId: string, params: ResponsibilityHistoryParams = {}) {
    return this.request<ResponsibilityHistoryResult>(buildResponsibilityHistoryPath(caseId, params));
  }

  // WP-1d-5-5: Hukuki Sorumlu Avukat KONTROLLÜ değişikliği. Mevcut #474 backend endpoint'ini tüketir
  // (ADMIN-only hard guard + validasyon + audit + tek-tx BACKEND'de). Frontend yalnız çağırır.
  // "Devir" DEĞİL — hukuki sorumlu avukat kaydı kurallı şekilde değiştirilir.
  async changeLegalResponsibleLawyer(
    caseId: string,
    payload: { lawyerId: string; reason: string; note?: string }
  ) {
    return this.request(`/cases/${caseId}/legal-responsible-lawyer`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
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

  // Case Debtors (FAZ 1 - Borçlu Modülü)
  async getCaseDebtors(caseId: string, options?: { includePassive?: boolean }) {
    const query = options?.includePassive ? "?includePassive=true" : "";
    return this.request<CaseDebtorsResponse>(`/debtors/case/${caseId}${query}`);
  }

  async getCaseDebtorDetail(caseId: string, caseDebtorId: string) {
    return this.request<DebtorDetailDTO>(`/debtors/case/${caseId}/${caseDebtorId}`);
  }

  async updateDebtorQuickNote(caseId: string, caseDebtorId: string, text: string) {
    return this.request<{ quickNote: string | null; updatedAt: string }>(
      `/debtors/case/${caseId}/${caseDebtorId}/note`,
      {
        method: "PUT",
        body: JSON.stringify({ text }),
      }
    );
  }

  // FAZ 2 - Tebligat Yönetimi
  async updateServiceStatus(
    caseId: string,
    caseDebtorId: string,
    data: UpdateServiceStatusDTO
  ) {
    return this.request<DebtorDetailDTO>(
      `/debtors/case/${caseId}/${caseDebtorId}/service`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  }

  async getServiceHistory(caseId: string, caseDebtorId: string) {
    return this.request<ServiceHistoryItem[]>(
      `/debtors/case/${caseId}/${caseDebtorId}/service/history`
    );
  }

  async startNewServiceAttempt(
    caseId: string,
    caseDebtorId: string,
    newAddressId?: string
  ) {
    return this.request<DebtorDetailDTO>(
      `/debtors/case/${caseId}/${caseDebtorId}/service/retry`,
      {
        method: "POST",
        body: JSON.stringify({ newAddressId }),
      }
    );
  }

  // ==================== ADDRESS API (Tebligat Kanunu) ====================

  async getDebtorAddresses(debtorId: string) {
    return this.request<AddressDTO[]>(`/debtors/${debtorId}/addresses`);
  }

  async createAddress(debtorId: string, data: CreateAddressDTO) {
    return this.request<AddressDTO>(`/debtors/${debtorId}/addresses`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAddress(addressId: string, data: UpdateAddressDTO) {
    return this.request<AddressDTO>(`/addresses/${addressId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteAddress(addressId: string) {
    return this.request<{ success: boolean }>(`/addresses/${addressId}`, {
      method: "DELETE",
    });
  }

  async setActiveAddress(caseDebtorId: string, addressId: string) {
    return this.request<{ success: boolean }>(
      `/case-debtors/${caseDebtorId}/active-address`,
      {
        method: "POST",
        body: JSON.stringify({ addressId }),
      }
    );
  }

  async getAddressHistory(addressId: string) {
    return this.request<ServiceHistoryItem[]>(`/addresses/${addressId}/history`);
  }

  async addAddressRiskFlag(addressId: string, flag: AddressRiskFlag, reason?: string) {
    return this.request<AddressDTO>(`/addresses/${addressId}/risk-flags`, {
      method: "POST",
      body: JSON.stringify({ flag, reason }),
    });
  }

  async removeAddressRiskFlag(addressId: string, flag: AddressRiskFlag) {
    return this.request<AddressDTO>(`/addresses/${addressId}/risk-flags/${flag}`, {
      method: "DELETE",
    });
  }

  async recordTK21_2(addressId: string, data: TK21_2RecordDTO) {
    return this.request<AddressDTO>(`/addresses/${addressId}/tk21-2`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Address Verification
  async verifyAddressViaMernis(addressId: string, tckn: string) {
    return this.request<VerificationResultDTO>(`/addresses/${addressId}/verify/mernis`, {
      method: "POST",
      body: JSON.stringify({ tckn }),
    });
  }

  async verifyAddressViaMersis(addressId: string, vkn: string) {
    return this.request<VerificationResultDTO>(`/addresses/${addressId}/verify/mersis`, {
      method: "POST",
      body: JSON.stringify({ vkn }),
    });
  }

  async verifyAllAddresses(debtorId: string) {
    return this.request<BulkVerificationResultDTO>(`/debtors/${debtorId}/addresses/verify-all`, {
      method: "POST",
    });
  }

  // Phase 2: Next Address Suggestion
  async suggestNextAddress(addressId: string, debtorId: string, returnReason: ServiceReturnReason) {
    return this.request<NextAddressSuggestionDTO>(`/addresses/${addressId}/suggest-next`, {
      method: "POST",
      body: JSON.stringify({ debtorId, returnReason }),
    });
  }

  // Phase 3: Address Success Stats
  async getAddressStats(addressId: string) {
    return this.request<AddressStatsDTO>(`/addresses/${addressId}/stats`);
  }

  async getAddressesSortedBySuccess(debtorId: string) {
    return this.request<AddressWithStatsDTO[]>(`/debtors/${debtorId}/addresses/sorted`);
  }

  // Phase 4: Notification Chain
  async getNotificationChain(debtorId: string) {
    return this.request<NotificationChainDTO>(`/debtors/${debtorId}/notification-chain`);
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

  async updateLawyer(id: string, data: {
    phone?: string;
    email?: string;
    address?: string;
    bankName?: string;
    branchName?: string;
    iban?: string;
  }) {
    return this.request<any>(`/lawyers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Staff Members
  async getStaffMembers(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<any[]>(`/staff${query}`);
  }

  // Execution Offices (İcra Daireleri)
  async getExecutionOffices(city?: string) {
    const query = city ? `?city=${encodeURIComponent(city)}` : "";
    return this.request<any[]>(`/execution-offices${query}`);
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

  async post<T = any>(endpoint: string, body?: any, options?: { headers?: Record<string, string> }): Promise<{ data: T }> {
    // FormData için özel işlem
    if (body instanceof FormData) {
      const token = this.getToken();
      const headers: HeadersInit = {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      };
      // Content-Type'ı kaldır, browser otomatik ayarlasın
      delete (headers as any)["Content-Type"];
      
      const response = await fetch(`${API_URL}/api${endpoint}`, {
        method: "POST",
        headers,
        body,
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Bir hata oluştu");
      }
      
      const data = await response.json();
      return { data };
    }
    
    const data = await this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "DELETE",
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

  // P3-2C-FE: confirmationToken OPSİYONEL — guarded-edge CONFIRM_REQUIRED retry'ında envelope.confirmation.token
  // body'ye eklenir (backend P3-2C consume eder). Verilmezse mevcut davranış AYNEN (backend default OFF → zarf dönmez).
  async changeCaseStatus(caseId: string, status: string, reason?: string, confirmationToken?: string) {
    return this.request<any>(`/case-status/${caseId}/change`, {
      method: "POST",
      body: JSON.stringify({ status, reason, ...(confirmationToken ? { confirmationToken } : {}) }),
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

  // ============================================
  // ValidationGate API
  // ============================================

  /**
   * Belirli bir gate icin dosyayi validate et
   */
  async validateGate(caseId: string, gateId: string, additionalData?: Record<string, any>) {
    return this.request<ValidationGateResult>(`/validation-gate/${caseId}/validate/${gateId}`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Tum gate'leri validate et
   */
  async validateAllGates(caseId: string, additionalData?: Record<string, any>) {
    return this.request<Record<string, ValidationGateResult>>(`/validation-gate/${caseId}/validate-all`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Gate 1 - Takip Olusturma validasyonu
   */
  async validateCaseCreation(caseId: string, additionalData?: Record<string, any>) {
    return this.request<ValidationGateResult>(`/validation-gate/${caseId}/case-creation`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Gate 2 - Ornek 1 Uretimi validasyonu
   */
  async validateOrnek1Generation(caseId: string, additionalData?: Record<string, any>) {
    return this.request<ValidationGateResult>(`/validation-gate/${caseId}/ornek1-generation`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Gate 3 - Tebligat validasyonu
   */
  async validateServiceOfProcess(caseId: string, additionalData?: Record<string, any>) {
    return this.request<ValidationGateResult>(`/validation-gate/${caseId}/service-of-process`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Gate 4 - UYAP Gonderimi validasyonu
   */
  async validateUyapIntegration(caseId: string, additionalData?: Record<string, any>) {
    return this.request<ValidationGateResult>(`/validation-gate/${caseId}/uyap-integration`, {
      method: "POST",
      body: additionalData ? JSON.stringify(additionalData) : undefined,
    });
  }

  /**
   * Validasyon kurallarini getir
   */
  async getValidationRules() {
    return this.request<ValidationRulesResponse>("/validation-gate/rules");
  }

  /**
   * PR-D4e-3c/D4e-4: Haciz öncesi saha istihbaratı soft-uyarıları + risk read-model (read-only, blok yok).
   * warnings[] geriye uyum için kalır; debtors[] borçlu-bazlı seviye+nedenler, overallLevel rollup.
   */
  async getPreHacizIntelligence(caseId: string) {
    return this.request<{
      caseId: string;
      isValid: boolean;
      warnings: { id: string; path: string; severity: string; message: string }[];
      debtors: { debtorId: string; name: string; level: PreHacizRiskLevel; score: number; reasons: { id: string; message: string; severity: string }[] }[];
      overallLevel: PreHacizRiskLevel;
    }>(`/validation-gate/${caseId}/pre-haciz-intelligence`);
  }

  /**
   * Politika degerini getir
   */
  async getValidationPolicy(key: string) {
    return this.request<{ key: string; value: any }>(`/validation-gate/policy?key=${encodeURIComponent(key)}`);
  }

  /**
   * PR-D4e-7: Dosyanın haciz gönderim KARAR-ANI audit kayıtları (read-only, salt görüntü).
   * Mevcut GET /audit/logs yeniden kullanılır (tenant-scoped); yeni endpoint yok.
   */
  async getCaseHacizAudits(caseId: string, page = 1, limit = 20) {
    const params = new URLSearchParams({
      entityType: "CASE",
      entityId: caseId,
      action: "HACIZ_REQUEST_SUBMITTED",
      page: String(page),
      limit: String(limit),
    });
    return this.request<{
      logs: HacizAuditLog[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/audit/logs?${params.toString()}`);
  }

  /**
   * Cek tazminati bilgisi
   */
  async getCheckCompensationInfo() {
    return this.request<CheckCompensationInfo>("/validation-gate/check-compensation-info");
  }

  /**
   * Adres onerileri
   */
  async getAddressSuggestions() {
    return this.request<AddressSuggestionsResponse>("/validation-gate/address-suggestions");
  }

  // ============================================
  // Case Instrument (Cek/Senet) API
  // ============================================

  async createInstrument(data: Omit<CaseInstrument, 'id' | 'createdAt'>) {
    return this.request<CaseInstrument>("/case-instruments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getInstrumentsByCase(caseId: string) {
    return this.request<CaseInstrument[]>(`/case-instruments/case/${caseId}`);
  }

  async getInstrument(id: string) {
    return this.request<CaseInstrument>(`/case-instruments/${id}`);
  }

  async updateInstrument(id: string, data: Partial<CaseInstrument>) {
    return this.request<CaseInstrument>(`/case-instruments/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteInstrument(id: string) {
    return this.request<void>(`/case-instruments/${id}`, { method: "DELETE" });
  }

  async getInstrumentsTotal(caseId: string) {
    return this.request<{ total: number }>(`/case-instruments/case/${caseId}/total`);
  }

  /**
   * A1 Faz 2b-B — SAF kambiyo zinciri analizi (hamil + ADAY müracaat borçluları).
   * POST /case-instruments/chain/analyze (2a motoru; #384). DB'ye dokunmaz, kayıt YARATMAZ.
   * Kalıcılık ayrıdır: zinciri kaydetmek için updateInstrument(id, { endorsers, avals }).
   */
  async analyzeInstrumentChain(chain: InstrumentChain) {
    return this.request<ChainAnalysis>("/case-instruments/chain/analyze", {
      method: "POST",
      body: JSON.stringify(chain),
    });
  }

  // ============================================
  // Case Lease (Kira) API
  // ============================================

  async createLease(data: Omit<CaseLease, 'id' | 'createdAt'>) {
    return this.request<CaseLease>("/case-leases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getLeaseByCase(caseId: string) {
    return this.request<CaseLease | null>(`/case-leases/case/${caseId}`);
  }

  async getLease(id: string) {
    return this.request<CaseLease>(`/case-leases/${id}`);
  }

  async updateLease(id: string, data: Partial<CaseLease>) {
    return this.request<CaseLease>(`/case-leases/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteLease(id: string) {
    return this.request<void>(`/case-leases/${id}`, { method: "DELETE" });
  }

  async getLeaseDebt(caseId: string) {
    return this.request<{ total: number; months: number; monthlyRent: number }>(`/case-leases/case/${caseId}/debt`);
  }

  // ============================================
  // Case Judgment (Ilam) API
  // ============================================

  async createJudgment(data: Omit<CaseJudgment, 'id' | 'createdAt'>) {
    return this.request<CaseJudgment>("/case-judgments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getJudgmentByCase(caseId: string) {
    return this.request<CaseJudgment | null>(`/case-judgments/case/${caseId}`);
  }

  async getJudgment(id: string) {
    return this.request<CaseJudgment>(`/case-judgments/${id}`);
  }

  async updateJudgment(id: string, data: Partial<CaseJudgment>) {
    return this.request<CaseJudgment>(`/case-judgments/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteJudgment(id: string) {
    return this.request<void>(`/case-judgments/${id}`, { method: "DELETE" });
  }

  async getJudgmentTotal(caseId: string) {
    return this.request<{ total: number; judgmentAmount: number; monthlyNafaka: number }>(`/case-judgments/case/${caseId}/total`);
  }

  // ============================================
  // Case Collateral (Rehin/Ipotek) API
  // ============================================

  async createCollateral(data: Omit<CaseCollateral, 'id' | 'createdAt'>) {
    return this.request<CaseCollateral>("/case-collaterals", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCollateralsByCase(caseId: string) {
    return this.request<CaseCollateral[]>(`/case-collaterals/case/${caseId}`);
  }

  async getCollateral(id: string) {
    return this.request<CaseCollateral>(`/case-collaterals/${id}`);
  }

  async updateCollateral(id: string, data: Partial<CaseCollateral>) {
    return this.request<CaseCollateral>(`/case-collaterals/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteCollateral(id: string) {
    return this.request<void>(`/case-collaterals/${id}`, { method: "DELETE" });
  }

  async getCollateralsTotal(caseId: string) {
    return this.request<{ totalEstimated: number; totalMortgage: number; count: number }>(`/case-collaterals/case/${caseId}/total`);
  }

  // ============================================
  // Template Engine API
  // ============================================

  /**
   * Takip Talebi oluştur (text formatında)
   */
  async generateTakipTalebi(data: TemplateData): Promise<GeneratedDocument> {
    return this.request<GeneratedDocument>("/template-engine/takip-talebi", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Takip Talebi oluştur - Case ID ile
   */
  async generateTakipTalebiFromCase(caseId: string): Promise<GeneratedDocument> {
    return this.request<GeneratedDocument>(`/template-engine/takip-talebi/case/${caseId}`);
  }

  /**
   * Takip Talebi önizleme (HTML formatında)
   */
  async previewTakipTalebi(data: TemplateData): Promise<{ html: string }> {
    return this.request<{ html: string }>("/template-engine/takip-talebi/preview", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Takip Talebi PDF indir
   */
  async downloadTakipTalebiPdf(data: TemplateData): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${this.getApiUrl()}/api/template-engine/takip-talebi/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("PDF indirme hatası");
    return response.blob();
  }

  /**
   * Takip Talebi Word indir
   */
  async downloadTakipTalebiWord(data: TemplateData): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${this.getApiUrl()}/api/template-engine/takip-talebi/word`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Word indirme hatası");
    return response.blob();
  }

  /**
   * Takip Talebi UDF oluştur (UYAP için)
   */
  async generateTakipTalebiUdf(data: TemplateData): Promise<UdfDocument> {
    return this.request<UdfDocument>("/template-engine/takip-talebi/udf", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Case ID'den PDF indir
   */
  async downloadPdfFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi'): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${this.getApiUrl()}/api/template-engine/case/${caseId}/pdf?type=${documentType}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) throw new Error("PDF indirme hatası");
    return response.blob();
  }

  /**
   * Case ID'den Word indir
   */
  async downloadWordFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi'): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${this.getApiUrl()}/api/template-engine/case/${caseId}/word?type=${documentType}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) throw new Error("Word indirme hatası");
    return response.blob();
  }

  /**
   * Case ID'den UDF oluştur (UYAP için)
   */
  async generateUdfFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi'): Promise<UdfDocument> {
    return this.request<UdfDocument>(`/template-engine/case/${caseId}/udf?type=${documentType}`);
  }

  /**
   * Case ID'den UDF dosyası indir
   */
  async downloadUdfFromCase(caseId: string, documentType: 'takip-talebi' | 'odeme-emri' | 'icra-emri' = 'takip-talebi'): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${this.getApiUrl()}/api/template-engine/case/${caseId}/udf/download?type=${documentType}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) throw new Error("UDF indirme hatası");
    return response.blob();
  }

  /**
   * Mevcut şablon listesi
   */
  async getTemplates(): Promise<Array<{ code: string; name: string; category: string }>> {
    return this.request<Array<{ code: string; name: string; category: string }>>("/template-engine/templates");
  }

  // ============================================
  // İhtiyati Haciz API
  // ============================================

  /**
   * İhtiyati haciz kararı oluştur
   */
  async createPrecautionaryOrder(data: {
    caseId: string;
    orderType?: string;
    courtName: string;
    courtCity?: string;
    decisionDate: string;
    decisionNo?: string;
    scopeNote?: string;
    coveredDebtorIds?: string[];
    securedAmount: number;
    currency?: string;
    requiresSecurityDeposit?: boolean;
    securityDepositAmount?: number;
    securityDepositType?: 'NAKIT' | 'TEMINAT_MEKTUBU' | 'GAYRIMENKUL' | 'KEFALET' | 'DIGER';
    securityDepositNote?: string;
    notes?: string;
  }) {
    return this.request<any>("/precautionary-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * İhtiyati haciz kararını getir
   */
  async getPrecautionaryOrder(id: string) {
    return this.request<any>(`/precautionary-orders/${id}`);
  }

  /**
   * Dosyaya ait ihtiyati haciz kararlarını getir
   */
  async getPrecautionaryOrdersByCase(caseId: string) {
    return this.request<any[]>(`/precautionary-orders/case/${caseId}`);
  }

  /**
   * İhtiyati haciz kararını güncelle
   */
  async updatePrecautionaryOrder(id: string, data: any) {
    return this.request<any>(`/precautionary-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /**
   * İhtiyati haciz kararını uygula
   */
  async applyPrecautionaryOrder(id: string) {
    return this.request<any>(`/precautionary-orders/${id}/apply`, {
      method: "POST",
    });
  }

  /**
   * İhtiyati haciz kararını kaldır
   */
  async liftPrecautionaryOrder(id: string, reason?: string) {
    return this.request<any>(`/precautionary-orders/${id}/lift`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * İhtiyati haciz kararını sil
   */
  async deletePrecautionaryOrder(id: string) {
    return this.request<any>(`/precautionary-orders/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * İhtiyati haciz masraf kalemi ekle
   */
  async addPrecautionaryCost(orderId: string, data: {
    costType: 'HARC' | 'POSTA' | 'VEKALET' | 'TEMINAT' | 'YEDIEMIN' | 'BILIRKISI' | 'MUHAFAZA' | 'DIGER';
    amount: number;
    currency?: string;
    description?: string;
    label?: string;
    isClaimedInEnforcement?: boolean;
  }) {
    return this.request<any>(`/precautionary-orders/${orderId}/costs`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * İhtiyati haciz masraf kalemini güncelle
   */
  async updatePrecautionaryCost(costId: string, data: any) {
    return this.request<any>(`/precautionary-orders/costs/${costId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /**
   * İhtiyati haciz masraf kalemini sil
   */
  async deletePrecautionaryCost(costId: string) {
    return this.request<any>(`/precautionary-orders/costs/${costId}`, {
      method: "DELETE",
    });
  }

  /**
   * İhtiyati haciz masraflarının toplamını hesapla
   */
  async getPrecautionaryCostsTotal(orderId: string) {
    return this.request<{ total: number; claimedTotal: number; count: number; claimedCount: number }>(`/precautionary-orders/${orderId}/costs/total`);
  }

  // ============================================
  // İlgili Davalar (Related Lawsuits) API
  // ============================================

  /**
   * Tüm dava türlerini getir
   */
  async getRelatedLawsuitTypes() {
    return this.request<{ types: any[] }>('/related-lawsuits/types');
  }

  /**
   * Takip türüne göre dava türlerini getir
   */
  async getRelatedLawsuitTypesByCaseType(caseType: string) {
    return this.request<{ caseType: string; types: any[] }>(`/related-lawsuits/types/by-case-type?caseType=${caseType}`);
  }

  /**
   * Aşamaya göre dava türlerini getir
   */
  async getRelatedLawsuitTypesByStage(stage: string) {
    return this.request<{ stage: string; types: any[] }>(`/related-lawsuits/types/by-stage?stage=${stage}`);
  }

  /**
   * Dosya için açılabilecek davaları kontrol et
   */
  async checkAvailableLawsuits(data: {
    caseType: string;
    stage: string;
    instrumentType?: string;
    instrumentDates?: {
      presentationDate?: string;
      maturityDate?: string;
      objectionDate?: string;
    };
  }) {
    return this.request<{ lawsuits: any[] }>('/related-lawsuits/check-available', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Dosya için dava önerileri al
   */
  async getRelatedLawsuitRecommendations(data: {
    caseType: string;
    stage: string;
    instrumentType?: string;
    instrumentDates?: {
      presentationDate?: string;
      maturityDate?: string;
      objectionDate?: string;
    };
  }) {
    return this.request<{ recommendations: any[] }>('/related-lawsuits/recommendations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Karşılıksız çek şikayet dilekçesi verilerini hazırla
   */
  async prepareKarsiliksizCekPetition(data: {
    creditor: { name: string; identityNo?: string; address?: string };
    debtor: { name: string; identityNo?: string; address?: string };
    instrument: {
      serialNo: string;
      amount: number;
      currency?: string;
      bank: string;
      branch?: string;
      presentationDate: string;
      dishonorDate?: string;
      issuePlace?: string;
    };
    lawyer?: { name: string; barNumber: string };
  }) {
    return this.request<{
      data: any;
      templateInfo: any;
      uyapDavaTuru: string;
      courtType: string;
    }>('/related-lawsuits/prepare/karsiliksiz-cek', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * UYAP dava türü kodunu getir
   */
  async getUyapLawsuitCode(lawsuitCode: string) {
    return this.request<{
      lawsuitCode: string;
      uyapDavaTuru: string;
      courtType: string;
    }>(`/related-lawsuits/uyap-code/${lawsuitCode}`);
  }

  /**
   * API URL'ini al (private helper)
   */
  private getApiUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  }

  // ============================================
  // Tebligat API
  // ============================================

  async createTebligat(data: Omit<Tebligat, 'id' | 'createdAt' | 'status'>) {
    return this.request<Tebligat>("/tebligat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getTebligatsByCase(caseId: string) {
    return this.request<Tebligat[]>(`/tebligat/case/${caseId}`);
  }

  async getTebligatsByCaseDebtor(caseDebtorId: string) {
    return this.request<Tebligat[]>(`/tebligat/case-debtor/${caseDebtorId}`);
  }

  async getTebligat(id: string) {
    return this.request<Tebligat>(`/tebligat/${id}`);
  }

  async updateTebligat(id: string, data: Partial<Tebligat>) {
    return this.request<Tebligat>(`/tebligat/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async markTebligatAsSent(id: string, barcodeNo?: string) {
    return this.request<Tebligat>(`/tebligat/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ barcodeNo }),
    });
  }

  async recordPttResult(id: string, data: {
    pttResult: TebligatPttResult;
    pttResultDate?: string;
    pttResultNote?: string;
    barcodeNo?: string;
    tk21Type?: 'TK_21_1' | 'TK_21_2';
    muhtarlikDate?: string;
    ilanDate?: string;
  }) {
    return this.request<{ tebligat: Tebligat; nextAction: TebligatNextAction; message: string }>(`/tebligat/${id}/ptt-result`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async checkAddressPriority(caseId: string, caseDebtorId?: string, addressType?: TebligatAddressType) {
    const params = new URLSearchParams();
    if (caseDebtorId) params.set('caseDebtorId', caseDebtorId);
    if (addressType) params.set('addressType', addressType);
    return this.request<{
      currentAddressType: TebligatAddressType;
      canUseMernis: boolean;
      mustUseBilinen: boolean;
      suggestedAction: TebligatNextAction;
      message: string;
    }>(`/tebligat/check-priority/${caseId}?${params}`);
  }

  async createMernisTebligat(id: string, mernisAddress: string) {
    return this.request<Tebligat>(`/tebligat/${id}/create-mernis`, {
      method: "POST",
      body: JSON.stringify({ mernisAddress }),
    });
  }

  async getTebligatSummary(caseId?: string) {
    const query = caseId ? `?caseId=${caseId}` : '';
    return this.request<TebligatSummary>(`/tebligat/summary${query}`);
  }

  async getPendingTebligatActions() {
    return this.request<Tebligat[]>("/tebligat/pending-actions");
  }

  // PTT Barkod Sorgulama
  async trackPttBarcode(barcodeNo: string) {
    return this.request<PttTrackingResult>(`/tebligat/ptt-track/${barcodeNo}`);
  }

  async trackPttBarcodesBulk(barcodeNos: string[]) {
    return this.request<Record<string, PttTrackingResult>>("/tebligat/ptt-track-bulk", {
      method: "POST",
      body: JSON.stringify({ barcodeNos }),
    });
  }

  // UETS/KEP
  async checkUetsRegistration(tcVkn: string) {
    return this.request<UetsRecipient>(`/tebligat/uets-check/${tcVkn}`);
  }

  async sendTebligatViaUets(id: string, subject: string, content: string) {
    return this.request<{ success: boolean; uetsNo?: string; errorMessage?: string }>(`/tebligat/${id}/send-uets`, {
      method: "POST",
      body: JSON.stringify({ subject, content }),
    });
  }

  async sendTebligatViaKep(id: string, subject: string, content: string) {
    return this.request<{ success: boolean; kepNo?: string; errorMessage?: string }>(`/tebligat/${id}/send-kep`, {
      method: "POST",
      body: JSON.stringify({ subject, content }),
    });
  }

  async checkUetsDeliveryStatus(uetsNo: string) {
    return this.request<{ uetsNo: string; status: string; deliveredAt?: string; readAt?: string }>(`/tebligat/uets-status/${uetsNo}`);
  }

  async determineElectronicChannel(tcVkn: string) {
    return this.request<TebligatChannel | null>(`/tebligat/electronic-channel/${tcVkn}`);
  }

  // ============================================
  // UYAP API
  // ============================================

  async getUyapStatus() {
    return this.request<UyapStatus>("/uyap/status");
  }

  async getUyapStats() {
    return this.request<{ total: number; pending: number; success: number; failed: number }>("/uyap/stats");
  }

  async validateUyapPoa(clientId: string, lawyerId: string) {
    return this.request<UyapPoaValidation>(`/uyap/poa/validate?clientId=${clientId}&lawyerId=${lawyerId}`);
  }

  async validateUyapCasePoa(caseId: string) {
    return this.request<UyapCasePoaValidation>(`/uyap/poa/validate/case/${caseId}`);
  }

  async submitUyapDocument(data: {
    caseId: string;
    documentType: UyapDocumentType;
    documentContent: string;
    documentName: string;
    clientId?: string;
    lawyerId?: string;
  }) {
    return this.request<UyapResponse>("/uyap/document/submit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async queryUyapCaseStatus(caseId: string, uyapDosyaId?: string) {
    const query = uyapDosyaId ? `?uyapDosyaId=${uyapDosyaId}` : '';
    return this.request<UyapResponse<UyapCaseStatus>>(`/uyap/case/${caseId}/status${query}`);
  }

  async queryUyapDebtorAssets(debtorIdentityNo: string, caseId: string) {
    return this.request<UyapResponse<UyapDebtorAssets>>("/uyap/debtor/assets", {
      method: "POST",
      body: JSON.stringify({ debtorIdentityNo, caseId }),
    });
  }

  async getUyapRequestHistory(caseId?: string, limit?: number) {
    const params = new URLSearchParams();
    if (caseId) params.set('caseId', caseId);
    if (limit) params.set('limit', limit.toString());
    const query = params.toString() ? `?${params}` : '';
    return this.request<UyapRequestLog[]>(`/uyap/history${query}`);
  }

  async sendUyapPaymentOrder(data: {
    caseId: string;
    executionOfficeCode: string;
    creditor: { id?: string; name: string; identityNo?: string; address?: string };
    debtor: { name: string; identityNo?: string; address?: string };
    lawyerId?: string;
    amount: number;
    currency: string;
    interestType?: string;
    interestStartDate?: string;
  }) {
    return this.request<UyapResponse>("/uyap/test/payment-order", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async sendUyapHacizRequest(data: {
    caseId: string;
    targetType: HacizTargetType;
    targetDetails: Record<string, any>;
    amount: number;
    clientId?: string;
    lawyerId?: string;
  }) {
    return this.request<UyapResponse>("/uyap/haciz", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async checkUyapTebligat(tebligatId: string) {
    return this.request<UyapResponse>(`/uyap/tebligat/${tebligatId}`);
  }

  async checkUyapMts(referenceNo: string) {
    return this.request<UyapResponse>(`/uyap/mts/${referenceNo}`);
  }

  async retryUyapFailedRequests() {
    return this.request<{ message: string; retriedCount: number }>("/uyap/retry-failed", {
      method: "POST",
    });
  }

  // ============================================
  // Reports API
  // ============================================

  async getDashboardStats() {
    return this.request<DashboardStats>("/reports/dashboard");
  }

  async getClientReport(clientId?: string) {
    const query = clientId ? `?clientId=${clientId}` : '';
    return this.request<ClientReport>(`/reports/client${query}`);
  }

  async getPersonelReport(filters?: { personelId?: string; startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    if (filters?.personelId) params.set('personelId', filters.personelId);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    const query = params.toString() ? `?${params}` : '';
    return this.request<PersonelReport[]>(`/reports/personel${query}`);
  }

  async getRiskReport(riskId?: string) {
    const query = riskId ? `?riskId=${riskId}` : '';
    return this.request<RiskReport>(`/reports/risk${query}`);
  }

  async getRiskSummary() {
    return this.request<RiskSummary>("/reports/risk-summary");
  }

  async getGroupReport(groupId: string) {
    return this.request<GroupReport>(`/reports/group/${groupId}`);
  }

  async getCaseDebtReport(caseId: string, calculationDate?: string) {
    const query = calculationDate ? `?calculationDate=${calculationDate}` : '';
    return this.request<CaseDebtReport>(`/reports/case-debt/${caseId}${query}`);
  }

  async getInterestReport(caseId: string, startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString() ? `?${params}` : '';
    return this.request<InterestReport>(`/reports/interest/${caseId}${query}`);
  }

  async getCollectionHistoryReport(filters?: {
    caseId?: string;
    startDate?: string;
    endDate?: string;
    channels?: string[];
    statuses?: string[];
  }) {
    const params = new URLSearchParams();
    if (filters?.caseId) params.set('caseId', filters.caseId);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.channels?.length) params.set('channels', filters.channels.join(','));
    if (filters?.statuses?.length) params.set('statuses', filters.statuses.join(','));
    const query = params.toString() ? `?${params}` : '';
    return this.request<CollectionHistoryReport>(`/reports/collection-history${query}`);
  }

  async getCollectionSummary(period?: 'week' | 'month' | 'year') {
    const query = period ? `?period=${period}` : '';
    return this.request<CollectionSummary>(`/reports/collection-summary${query}`);
  }

  async exportCasesAsCsv(filters?: {
    takipTuruId?: string;
    riskId?: string;
    caseStatus?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.takipTuruId) params.set('takipTuruId', filters.takipTuruId);
    if (filters?.riskId) params.set('riskId', filters.riskId);
    if (filters?.caseStatus) params.set('caseStatus', filters.caseStatus);
    const query = params.toString() ? `?${params}` : '';
    return this.request<{ data: string; contentType: string }>(`/reports/export/cases${query}`);
  }

  // ============================================
  // E-Sign Methods
  // ============================================

  async signDocument(data: ESignRequest): Promise<ESignResponse> {
    return this.request<ESignResponse>("/esign/sign", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSignStatus(requestId: string): Promise<ESignStatusResponse> {
    return this.request<ESignStatusResponse>(`/esign/status/${requestId}`);
  }

  async getSignLogs(caseId?: string): Promise<ESignLog[]> {
    const query = caseId ? `?caseId=${caseId}` : '';
    return this.request<ESignLog[]>(`/esign/logs${query}`);
  }

  async getAvailableSignProviders(): Promise<{ providers: ESignProvider[]; default: ESignProvider }> {
    return this.request<{ providers: ESignProvider[]; default: ESignProvider }>("/esign/providers");
  }

  async cancelSignRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/esign/cancel/${requestId}`, {
      method: "POST",
    });
  }

  // ============================================
  // Summary Engine Methods (Hesap Özeti Motoru)
  // ============================================

  /**
   * Dosya için hesap özeti hesapla
   */
  async getCaseSummary(caseId: string, asOfDate?: string): Promise<SummaryResult> {
    const query = asOfDate ? `?asOfDate=${asOfDate}` : '';
    return this.request<SummaryResult>(`/summary-engine/case/${caseId}${query}`);
  }

  /**
   * Tahsilat kaydet (TBK 100 ile otomatik dağıtım)
   */
  async recordPayment(caseId: string, data: {
    amount: number;
    entryDate?: string;
    description?: string;
    referenceNo?: string;
    sourceType?: string;
  }): Promise<{ ledgerEntry: any; allocations: any[] }> {
    return this.request<{ ledgerEntry: any; allocations: any[] }>(`/summary-engine/case/${caseId}/payment`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Kısmi talep güncelle (demandedAmount)
   */
  async updateDemandedAmount(claimItemId: string, demandedAmount: number): Promise<any> {
    return this.request<any>(`/summary-engine/claim-item/${claimItemId}/demanded-amount`, {
      method: "PUT",
      body: JSON.stringify({ demandedAmount }),
    });
  }

  /**
   * Hesap motoru kurallarını getir
   */
  async getSummaryEngineRules(): Promise<{
    rules: any;
    buckets: Record<string, { label: string; include_types: string[]; color?: string }>;
    allocationOrder: string[];
  }> {
    return this.request<any>("/summary-engine/rules");
  }

  /**
   * Bucket listesini getir
   */
  async getSummaryBuckets(): Promise<Record<string, { label: string; include_types: string[]; color?: string }>> {
    return this.request<any>("/summary-engine/buckets");
  }

  /**
   * TBK 100 mahsup sırasını getir
   */
  async getAllocationOrder(): Promise<{ order: string[]; description: string }> {
    return this.request<any>("/summary-engine/allocation-order");
  }

  // ============================================
  // Bank Methods
  // ============================================

  async getBankAccounts(): Promise<BankAccount[]> {
    return this.request<BankAccount[]>("/bank/accounts");
  }

  async createBankAccount(data: Omit<BankAccount, 'id' | 'tenantId' | 'createdAt' | 'lastSyncAt'>): Promise<BankAccount> {
    return this.request<BankAccount>("/bank/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBankAccount(id: string, data: Partial<BankAccount>): Promise<BankAccount> {
    return this.request<BankAccount>(`/bank/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBankAccount(id: string): Promise<void> {
    return this.request<void>(`/bank/accounts/${id}`, { method: "DELETE" });
  }

  async getBankBalance(iban: string): Promise<BankBalanceResponse> {
    return this.request<BankBalanceResponse>(`/bank/balance/${encodeURIComponent(iban)}`);
  }

  async syncBankBalance(accountId: string): Promise<BankBalanceResponse> {
    return this.request<BankBalanceResponse>(`/bank/accounts/${accountId}/sync`, {
      method: "POST",
    });
  }

  async getBankTransactions(filters?: {
    accountId?: string;
    startDate?: string;
    endDate?: string;
    type?: BankTransactionType;
    status?: BankTransactionStatus;
    unmatched?: boolean;
  }): Promise<BankTransaction[]> {
    const params = new URLSearchParams();
    if (filters?.accountId) params.set('accountId', filters.accountId);
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.unmatched) params.set('unmatched', 'true');
    const query = params.toString() ? `?${params}` : '';
    return this.request<BankTransaction[]>(`/bank/transactions${query}`);
  }

  async syncBankTransactions(accountId: string, startDate?: string, endDate?: string): Promise<{ count: number; transactions: BankTransaction[] }> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString() ? `?${params}` : '';
    return this.request<{ count: number; transactions: BankTransaction[] }>(`/bank/accounts/${accountId}/sync-transactions${query}`, {
      method: "POST",
    });
  }

  async matchTransactionToCase(transactionId: string, caseId: string): Promise<{ success: boolean; collectionId?: string }> {
    return this.request<{ success: boolean; collectionId?: string }>(`/bank/transactions/${transactionId}/match`, {
      method: "POST",
      body: JSON.stringify({ caseId }),
    });
  }

  async unmatchTransaction(transactionId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/bank/transactions/${transactionId}/unmatch`, {
      method: "POST",
    });
  }

  async autoMatchTransactions(): Promise<{ matched: number; unmatched: number }> {
    return this.request<{ matched: number; unmatched: number }>("/bank/auto-match", {
      method: "POST",
    });
  }

  async sendBankTransfer(data: BankTransferRequest): Promise<BankTransferResponse> {
    return this.request<BankTransferResponse>("/bank/transfer", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getTransferStatus(referenceNo: string): Promise<{ referenceNo: string; status: BankTransactionStatus; completedAt?: string }> {
    return this.request<{ referenceNo: string; status: BankTransactionStatus; completedAt?: string }>(`/bank/transfer/status/${referenceNo}`);
  }

  async getBankIntegrationStatus(): Promise<{ connected: boolean; providers: BankProvider[]; lastSync?: string }> {
    return this.request<{ connected: boolean; providers: BankProvider[]; lastSync?: string }>("/bank/status");
  }

  // ============================================
  // Payment Instruction API
  // ============================================

  /**
   * Ödeme talimatı oluştur
   */
  async createPaymentInstruction(data: {
    caseId: string;
    payerType: 'DEBTOR' | 'CREDITOR' | 'LAWYER';
    purpose: string;
    amount: number;
    payerName?: string;
    description?: string;
  }) {
    return this.request<PaymentInstructionResult>('/payment-instructions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Borçlu ödeme talimatı oluştur (kısayol)
   */
  async createDebtorPaymentInstruction(caseId: string, amount: number, debtorName: string) {
    return this.request<PaymentInstructionResult>('/payment-instructions/debtor', {
      method: 'POST',
      body: JSON.stringify({ caseId, amount, debtorName }),
    });
  }

  /**
   * Harç/Masraf ödeme talimatı oluştur (kısayol)
   */
  async createFeePaymentInstruction(caseId: string, purpose: string, amount: number) {
    return this.request<PaymentInstructionResult>('/payment-instructions/fee', {
      method: 'POST',
      body: JSON.stringify({ caseId, purpose, amount }),
    });
  }

  /**
   * Ödeme türlerini listele
   */
  async getPaymentPurposes() {
    return this.request<Array<{
      value: string;
      label: string;
      targetAccount: 'EMANET' | 'HARC' | 'CEZAEVI';
      allowedPayers: Array<'DEBTOR' | 'CREDITOR' | 'LAWYER'>;
    }>>('/payment-instructions/purposes');
  }

  /**
   * Ödeme türlerini ödeyene göre filtrele
   */
  async getPaymentPurposesByPayer(payerType: 'DEBTOR' | 'CREDITOR' | 'LAWYER') {
    return this.request<Array<{ value: string; label: string }>>(
      `/payment-instructions/purposes-by-payer?payerType=${payerType}`
    );
  }

  // ============================================
  // Expense Request API
  // ============================================

  async getExpenseRequests(params?: { caseId?: string; clientId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.caseId) query.set('caseId', params.caseId);
    if (params?.clientId) query.set('clientId', params.clientId);
    if (params?.status) query.set('status', params.status);
    return this.request<any[]>(`/expense-requests?${query}`);
  }

  async getExpenseRequest(id: string) {
    return this.request<any>(`/expense-requests/${id}`);
  }

  async getExpenseRequestsByCase(caseId: string) {
    return this.request<any[]>(`/expense-requests/by-case/${caseId}`);
  }

  async createExpenseRequest(data: { caseId: string; clientId: string; items: any[]; dueDate?: string; notes?: string; paidByLawyer?: boolean }) {
    return this.request<any>('/expense-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createExpenseRequestFromPackage(data: {
    caseId: string;
    clientId: string;
    packageCode: string;
    items: Array<{
      itemCode: string;
      label: string;
      suggestedAmount: number;
      finalAmount: number;
      wasOverridden?: boolean;
    }>;
    dueDate?: string;
    notes?: string;
    sendEmail?: boolean;
    sendSms?: boolean;
    sendWhatsapp?: boolean;
    paidByLawyer?: boolean;
  }) {
    return this.request<any>('/expense-requests/from-package', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExpenseRequest(id: string, data: any) {
    return this.request<any>(`/expense-requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async sendExpenseRequest(id: string, channel: string, notificationId?: string) {
    return this.request<any>(`/expense-requests/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ channel, notificationId }),
    });
  }

  async remindExpenseRequest(id: string) {
    return this.request<any>(`/expense-requests/${id}/remind`, {
      method: 'POST',
    });
  }

  async receiveExpenseRequest(id: string, paidAmount: number, receiptDocId?: string) {
    return this.request<any>(`/expense-requests/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ paidAmount, receiptDocId }),
    });
  }

  async cancelExpenseRequest(id: string, reason?: string) {
    return this.request<any>(`/expense-requests/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async deleteExpenseRequest(id: string) {
    return this.request<{ success: boolean }>(`/expense-requests/${id}`, {
      method: 'DELETE',
    });
  }

  async getExpenseRequestStats(caseId?: string) {
    const query = caseId ? `?caseId=${caseId}` : '';
    return this.request<{ pending: number; sent: number; received: number; totalReceived: number }>(`/expense-requests/stats${query}`);
  }

  async markExpenseRequestAsReceived(id: string, paidAmount: number, receiptDocId?: string) {
    return this.request<any>(`/expense-requests/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ paidAmount, receiptDocId }),
    });
  }

  // ============================================
  // NEW Expense Request API Methods
  // ============================================

  /**
   * Otomatik açılış masraf seti oluştur
   */
  async createOpeningExpenses(caseId: string) {
    return this.request<any>(`/expense-requests/case/${caseId}/opening`, {
      method: 'POST',
    });
  }

  /**
   * Aşama bazlı masraf seti oluştur
   */
  async createStageExpenses(caseId: string, stageCode: string) {
    return this.request<any>(`/expense-requests/case/${caseId}/stage/${stageCode}`, {
      method: 'POST',
    });
  }

  /**
   * Masraf talebi kesinleştir ve gönder
   */
  async finalizeExpenseRequest(id: string, channel: string = 'EMAIL') {
    return this.request<any>(`/expense-requests/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  }

  /**
   * Ödeme kaydet
   */
  async recordExpensePayment(id: string, payment: { amount: number; paymentDate: string; method: string; reference?: string; notes?: string }) {
    return this.request<any>(`/expense-requests/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify(payment),
    });
  }

  /**
   * Dosya masraf özeti
   */
  async getExpenseSummary(caseId: string) {
    return this.request<{
      totalRequested: number;
      totalPaid: number;
      totalPending: number;
      requestCount: number;
      paidCount: number;
      pendingCount: number;
      blockingUnpaid: number;
    }>(`/expense-requests/case/${caseId}/summary`);
  }

  /**
   * Dosya masrafları detaylı
   */
  async getExpenseDetails(caseId: string) {
    return this.request<any[]>(`/expense-requests/case/${caseId}/details`);
  }

  /**
   * Gate durumu kontrol et
   */
  async checkExpenseGate(caseId: string) {
    return this.request<{
      isBlocked: boolean;
      blockingExpenses: any[];
      totalPending: number;
      message?: string;
    }>(`/expense-requests/case/${caseId}/gate-status`);
  }

  /**
   * UYAP işlem izni kontrol et
   */
  async canPerformUyapAction(caseId: string, actionType: string) {
    return this.request<{ canPerform: boolean; actionType: string }>(`/expense-requests/case/${caseId}/can-perform/${actionType}`);
  }

  /**
   * Gate özeti
   */
  async getGateSummary(caseId: string) {
    return this.request<any>(`/expense-requests/case/${caseId}/gate-summary`);
  }

  /**
   * E-posta gönder
   */
  async sendExpenseEmail(id: string) {
    return this.request<any>(`/expense-requests/${id}/send-email`, {
      method: 'POST',
    });
  }

  /**
   * Hatırlatma gönder
   */
  async sendExpenseReminder(id: string) {
    return this.request<any>(`/expense-requests/${id}/send-reminder`, {
      method: 'POST',
    });
  }

  /**
   * Vadesi yaklaşan masraf taleplerini getir
   */
  async getDueExpenseReminders(days: number = 2) {
    return this.request<any[]>(`/expense-requests/due-reminders?days=${days}`);
  }

  /**
   * Gecikme görevi oluştur
   */
  async createExpenseOverdueTask(id: string) {
    return this.request<any>(`/expense-requests/${id}/create-overdue-task`, {
      method: 'POST',
    });
  }

  /**
   * Tek masraf için 3 görünüm
   */
  async getExpenseThreeView(id: string) {
    return this.request<{
      task: any;
      finance: any;
      clientRequest: any;
    }>(`/expense-requests/${id}/three-view`);
  }

  /**
   * Dosya için tüm masrafların 3 görünümü
   */
  async getExpenseThreeViewForCase(caseId: string) {
    return this.request<Array<{
      task: any;
      finance: any;
      clientRequest: any;
    }>>(`/expense-requests/case/${caseId}/three-view`);
  }

  /**
   * Yapılacaklar paneli için bekleyen masraf task'ları
   */
  async getPendingExpenseTasks() {
    return this.request<any[]>(`/expense-requests/pending-tasks`);
  }

  /**
   * Finans paneli için dosya masrafları
   */
  async getExpenseFinanceItems(caseId: string) {
    return this.request<any[]>(`/expense-requests/case/${caseId}/finance-items`);
  }

  /**
   * Müvekkil Talepleri paneli için masraf talepleri
   */
  async getClientExpenseRequests(clientId: string) {
    return this.request<any[]>(`/expense-requests/client/${clientId}/requests`);
  }

  /**
   * Masraf hesaplama önizleme
   */
  async calculateExpensePreview(data: { principalAmount: number; caseType?: string; stageCode?: string }) {
    return this.request<{
      stageCode: string;
      items: Array<{ itemCode: string; label: string; suggestedAmount: number }>;
      total: number;
    }>(`/expense-requests/calculate-preview`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Cost Package API (Masraf Paketleri)
  // ============================================

  async getCostPackages() {
    return this.request<any[]>('/cost-packages');
  }

  async getCostPackage(code: string) {
    return this.request<any>(`/cost-packages/${code}`);
  }

  async computeExpenseRequest(caseId: string, packageCode: string, params?: {
    debtorCount?: number;
    tebligatCount?: number;
    principalAmount?: number;
  }) {
    return this.request<{
      packageCode: string;
      packageName: string;
      items: Array<{
        itemCode: string;
        label: string;
        suggestedAmount: number;
        finalAmount: number;
        isEditable: boolean;
        calcParams?: any;
        sortOrder: number;
      }>;
      totalSuggested: number;
      messageTemplateCode: string | null;
    }>('/cost-packages/compute', {
      method: 'POST',
      body: JSON.stringify({ caseId, packageCode, ...params }),
    });
  }

  // ============================================
  // Case Balance API (Masraf Bakiyesi)
  // ============================================

  async getCaseBalance(caseId: string) {
    return this.request<{
      id: string;
      caseId: string;
      balance: number;
      lowThreshold: number;
      isLow: boolean;
      recentLedger: any[];
    }>(`/cases/${caseId}/balance`);
  }

  async getCaseBalanceLedger(caseId: string) {
    return this.request<any[]>(`/cases/${caseId}/balance/ledger`);
  }

  async creditCaseBalance(caseId: string, data: {
    amount: number;
    source: string;
    sourceId?: string;
    description?: string;
  }) {
    return this.request<{ success: boolean; newBalance: number; ledgerId: string }>(`/cases/${caseId}/balance/credit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async debitCaseBalance(caseId: string, data: {
    amount: number;
    source: string;
    sourceId?: string;
    description?: string;
  }) {
    return this.request<{ success: boolean; newBalance: number; ledgerId: string; isLow: boolean }>(`/cases/${caseId}/balance/debit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Stage Trigger API (Aşama Tetikleyici)
  // ============================================

  async triggerStage(caseId: string, eventCode: string, params?: {
    estimatedAmount?: number;
    tebligatCount?: number;
    debtorCount?: number;
    notes?: string;
  }) {
    return this.request<{
      action: 'OPEN_EXPENSE_MODAL' | 'READY' | 'OFFER_DEBIT_OR_REQUEST' | 'DEBIT_FROM_BALANCE' | 'SUGGEST_ONLY' | 'BLOCKED';
      expenseRequestId?: string;
      caseStatus?: string;
      debitedAmount?: number;
      newBalance?: number;
      suggestion?: {
        title: string;
        description: string;
        packageCode?: string;
      };
      blockReason?: string;
    }>(`/cases/${caseId}/stage-trigger`, {
      method: 'POST',
      body: JSON.stringify({ eventCode, params }),
    });
  }

  async prepareForUyap(caseId: string) {
    return this.request<{
      action: 'OPEN_EXPENSE_MODAL' | 'READY' | 'BLOCKED';
      expenseRequestId?: string;
      caseStatus?: string;
      blockReason?: string;
    }>(`/cases/${caseId}/uyap/prepare`, {
      method: 'POST',
    });
  }

  async executeOperation(caseId: string, operationCode: string, amount: number, description?: string) {
    return this.request<any>(`/cases/${caseId}/operations`, {
      method: 'POST',
      body: JSON.stringify({ operationCode, amount, description }),
    });
  }

  // ============================================
  // Message Template API
  // ============================================

  async getMessageTemplates(params?: { category?: string; channel?: string; isActive?: boolean }) {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.channel) query.set('channel', params.channel);
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    return this.request<any[]>(`/message-templates?${query}`);
  }

  async getMessageTemplate(id: string) {
    return this.request<any>(`/message-templates/${id}`);
  }

  async getMessageTemplateByCode(code: string) {
    return this.request<any>(`/message-templates/by-code/${code}`);
  }

  async createMessageTemplate(data: any) {
    return this.request<any>('/message-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMessageTemplate(id: string, data: any) {
    return this.request<any>(`/message-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMessageTemplate(id: string) {
    return this.request<{ success: boolean }>(`/message-templates/${id}`, {
      method: 'DELETE',
    });
  }

  async renderMessageTemplate(id: string, tokens: Record<string, string>) {
    return this.request<{ subject?: string; body: string }>(`/message-templates/${id}/render`, {
      method: 'POST',
      body: JSON.stringify(tokens),
    });
  }

  async seedMessageTemplates() {
    return this.request<{ success: boolean; message: string }>('/message-templates/seed', {
      method: 'POST',
    });
  }

  // ==================== ADDRESS DISCOVERY API ====================

  // Client Info Request
  async createClientInfoRequest(data: CreateClientInfoRequestDTO) {
    return this.request<ClientInfoRequestDTO>('/address-discovery/client-info-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getClientInfoRequestsForCase(caseId: string) {
    return this.request<ClientInfoRequestDTO[]>(`/address-discovery/client-info-request/case/${caseId}`);
  }

  async getClientInfoRequest(id: string) {
    return this.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}`);
  }

  async markClientInfoRequestAsResponded(id: string, notes?: string) {
    return this.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}/respond`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    });
  }

  async sendClientInfoRequestReminder(id: string) {
    return this.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}/reminder`, {
      method: 'POST',
    });
  }

  async markClientInfoRequestAsNoResponse(id: string) {
    return this.request<ClientInfoRequestDTO>(`/address-discovery/client-info-request/${id}/no-response`, {
      method: 'PUT',
    });
  }

  // UYAP Queries
  async createUyapQuery(data: CreateUyapQueryDTO) {
    return this.request<UyapQueryDTO>('/address-discovery/uyap-query', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUyapQueriesForDebtor(caseDebtorId: string) {
    return this.request<UyapQueryDTO[]>(`/address-discovery/uyap-query/debtor/${caseDebtorId}`);
  }

  async getUyapQuery(id: string) {
    return this.request<UyapQueryDTO>(`/address-discovery/uyap-query/${id}`);
  }

  async recordUyapQueryResponse(id: string, data: UpdateUyapQueryResponseDTO) {
    return this.request<UyapQueryDTO>(`/address-discovery/uyap-query/${id}/response`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async processUyapQueryAddresses(id: string, addresses: AddressFromQueryDTO[]) {
    return this.request<any[]>(`/address-discovery/uyap-query/${id}/process-addresses`, {
      method: 'POST',
      body: JSON.stringify({ addresses }),
    });
  }

  async getSuggestedUyapQueries(caseDebtorId: string) {
    return this.request<UyapQuerySuggestion[]>(`/address-discovery/uyap-query/debtor/${caseDebtorId}/suggestions`);
  }

  async getUyapQueryTypes() {
    return this.request<UyapQueryTypeInfo[]>('/address-discovery/uyap-query-types');
  }

  // Institution Letters
  async createInstitutionLetter(data: CreateInstitutionLetterDTO) {
    return this.request<InstitutionLetterDTO>('/address-discovery/institution-letter', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInstitutionLettersForDebtor(caseDebtorId: string) {
    return this.request<InstitutionLetterDTO[]>(`/address-discovery/institution-letter/debtor/${caseDebtorId}`);
  }

  async getInstitutionLetter(id: string) {
    return this.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}`);
  }

  async markInstitutionLetterAsSent(id: string, data: MarkLetterAsSentDTO) {
    return this.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}/sent`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async markInstitutionLetterAsResponded(id: string, data: MarkLetterAsRespondedDTO) {
    return this.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}/responded`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async markInstitutionLetterAsNoResponse(id: string) {
    return this.request<InstitutionLetterDTO>(`/address-discovery/institution-letter/${id}/no-response`, {
      method: 'PUT',
    });
  }

  async deleteInstitutionLetter(id: string) {
    return this.request<{ success: boolean }>(`/address-discovery/institution-letter/${id}`, {
      method: 'DELETE',
    });
  }

  async getInstitutionTemplates() {
    return this.request<InstitutionTemplateInfo[]>('/address-discovery/institution-templates');
  }

  // Cross-File
  async findSameDebtor(debtorId: string) {
    return this.request<CrossFileMatch[]>(`/address-discovery/cross-file/${debtorId}`);
  }

  async getCrossFileAddresses(debtorId: string, currentCaseId: string) {
    return this.request<CrossFileAddressDTO[]>(
      `/address-discovery/cross-file/${debtorId}/addresses?currentCaseId=${currentCaseId}`
    );
  }

  async copyAddressToCase(sourceAddressId: string, targetDebtorId: string) {
    return this.request<AddressDTO>('/address-discovery/cross-file/copy-address', {
      method: 'POST',
      body: JSON.stringify({ sourceAddressId, targetDebtorId }),
    });
  }

  async getCrossFileAddressCount(debtorId: string, currentCaseId: string) {
    return this.request<{ count: number }>(
      `/address-discovery/cross-file/${debtorId}/count?currentCaseId=${currentCaseId}`
    );
  }

  // Confidence Score
  async getConfidenceScore(addressId: string) {
    return this.request<{ score: number }>(`/address-discovery/confidence/${addressId}`);
  }

  async getConfidenceScoreBreakdown(addressId: string) {
    return this.request<ConfidenceScoreBreakdown>(`/address-discovery/confidence/${addressId}/breakdown`);
  }

  async updateAllConfidenceScores(debtorId: string) {
    return this.request<{ success: boolean }>(`/address-discovery/confidence/debtor/${debtorId}/update-all`, {
      method: 'POST',
    });
  }

  // Research Status
  async getResearchStatus(caseDebtorId: string) {
    return this.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}`);
  }

  async startResearch(caseDebtorId: string) {
    return this.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}/start`, {
      method: 'POST',
    });
  }

  async getResearchSuggestions(caseDebtorId: string) {
    return this.request<ResearchSuggestion[]>(`/address-discovery/research/${caseDebtorId}/suggestions`);
  }

  async getResearchTimeline(caseDebtorId: string) {
    return this.request<ResearchTimelineItem[]>(`/address-discovery/research/${caseDebtorId}/timeline`);
  }

  async completeResearch(caseDebtorId: string) {
    return this.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}/complete`, {
      method: 'PUT',
    });
  }

  async markResearchAsExhausted(caseDebtorId: string) {
    return this.request<AddressResearchDTO>(`/address-discovery/research/${caseDebtorId}/exhausted`, {
      method: 'PUT',
    });
  }

  // ============================================
  // Asset Query API (FAZ 4)
  // ============================================

  async runAssetQueries(caseDebtorId: string, data: RunAssetQueriesDTO) {
    return this.request<{ jobId: string; queries: AssetQueryDTO[] }>(
      `/asset-queries/debtor/${caseDebtorId}/run`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async getAssetQueriesForDebtor(caseDebtorId: string) {
    return this.request<AssetQueryDTO[]>(`/asset-queries/debtor/${caseDebtorId}`);
  }

  async getAssetSummary(caseDebtorId: string) {
    return this.request<AssetSummaryDTO>(`/asset-queries/debtor/${caseDebtorId}/summary`);
  }

  async getAssetQuery(queryId: string) {
    return this.request<AssetQueryDTO>(`/asset-queries/${queryId}`);
  }

  async updateAssetQueryResult(queryId: string, data: UpdateAssetQueryResultDTO) {
    return this.request<AssetQueryDTO>(`/asset-queries/${queryId}/result`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async cancelAssetQuery(queryId: string) {
    return this.request<{ success: boolean }>(`/asset-queries/${queryId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // UYAP Export API
  // ============================================

  /**
   * Tek dosyayı UYAP XML formatında export et
   */
  async exportCaseToUyap(caseId: string, includeDocuments = false) {
    return this.request<UyapExportResult>('/uyap-export/single', {
      method: 'POST',
      body: JSON.stringify({ caseId, includeDocuments }),
    });
  }

  /**
   * Tek dosyayı UYAP XML olarak indir
   */
  async downloadCaseXml(caseId: string): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${API_URL}/api/uyap-export/download/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'XML indirme hatası');
    }
    return response.blob();
  }

  /**
   * Birden fazla dosyayı toplu UYAP XML formatında export et
   */
  async exportBatchToUyap(caseIds: string[], batchName?: string, includeDocuments = false) {
    return this.request<UyapExportResult>('/uyap-export/batch', {
      method: 'POST',
      body: JSON.stringify({ caseIds, batchName, includeDocuments }),
    });
  }

  /**
   * Toplu dosyaları UYAP XML olarak indir
   */
  async downloadBatchXml(caseIds: string[], batchName?: string): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${API_URL}/api/uyap-export/batch/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ caseIds, batchName }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Toplu XML indirme hatası');
    }
    return response.blob();
  }

  /**
   * Dosyanın UYAP export için uygun olup olmadığını kontrol et
   */
  async validateCaseForUyapExport(caseId: string) {
    return this.request<UyapValidationResult>(`/uyap-export/validate/${caseId}`);
  }

  /**
   * Export edilebilir dosyaları listele
   */
  async getExportableCases(limit = 100) {
    return this.request<UyapExportableCasesResult>(`/uyap-export/exportable?limit=${limit}`);
  }

  // ============================================
  // Due (Alacak Kalemi) Methods
  // ============================================

  /**
   * Dosyanın alacak kalemlerini getir
   */
  async getCaseDues(caseId: string) {
    return this.request<DueDTO[]>(`/cases/${caseId}/dues`);
  }

  /**
   * Alacak kalemi ekle
   */
  async createDue(caseId: string, data: CreateDueDTO) {
    return this.request<DueDTO>(`/cases/${caseId}/dues`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Alacak kalemi güncelle
   */
  async updateDue(caseId: string, dueId: string, data: UpdateDueDTO) {
    return this.request<DueDTO>(`/cases/${caseId}/dues/${dueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Alacak kalemi sil
   */
  async deleteDue(caseId: string, dueId: string) {
    return this.request<{ success: boolean }>(`/cases/${caseId}/dues/${dueId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Collection (Tahsilat) Methods
  // ============================================

  /**
   * Dosyanın tahsilatlarını getir
   */
  async getCaseCollections(caseId: string) {
    return this.request<CollectionDTO[]>(`/cases/${caseId}/collections`);
  }

  /**
   * Dosyanın muhasebe/dağıtım kayıtlarını getir.
   * Çağrıldığı yerler:
   * - CaseDetailPage.fetchFinanceData() → GET /collection-dispositions/case/:caseId (OperationDeck muhasebe paneli)
   */
  async getCollectionDispositionsByCase(caseId: string, status?: CollectionDispositionStatus) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await this.request<{ data: CollectionDispositionDTO[] }>(
      `/collection-dispositions/case/${caseId}${query}`,
    );
    return response.data || [];
  }

  /**
   * Tahsilat ekle
   */
  async createCollection(caseId: string, data: CreateCollectionDTO) {
    return this.request<CollectionDTO>(`/cases/${caseId}/collections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Tahsilat güncelle
   */
  async updateCollection(caseId: string, collectionId: string, data: UpdateCollectionDTO) {
    return this.request<CollectionDTO>(`/cases/${caseId}/collections/${collectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Tahsilat iptal et
   */
  async cancelCollection(caseId: string, collectionId: string, reason?: string) {
    return this.request<CollectionDTO>(`/cases/${caseId}/collections/${collectionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Tahsilat sil
   */
  async deleteCollection(caseId: string, collectionId: string) {
    return this.request<{ success: boolean }>(`/cases/${caseId}/collections/${collectionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Dosya finans özeti
   */
  async getCaseFinanceSummary(caseId: string) {
    return this.request<CaseFinanceSummaryDTO>(`/cases/${caseId}/finance-summary`);
  }

  // ============================================
  // Address Task API
  // ============================================

  /**
   * Dosya için bekleyen adres görevlerini getir
   */
  async getAddressTasksForCase(caseId: string) {
    return this.request<{ tasks: AddressTaskDTO[] }>(`/address-tasks/case/${caseId}`);
  }

  /**
   * Dosya için tüm adres görevlerini getir
   */
  async getAllAddressTasksForCase(caseId: string) {
    return this.request<{ tasks: AddressTaskDTO[] }>(`/address-tasks/case/${caseId}/all`);
  }

  /**
   * Dosya için notları getir (audit log'lardan)
   */
  async getAddressNotesForCase(caseId: string) {
    return this.request<{ notes: AddressNoteDTO[] }>(`/address-tasks/case/${caseId}/notes`);
  }

  /**
   * Adres iş akışını başlat (takip yenilendiğinde)
   */
  async triggerAddressWorkflow(caseId: string, tenantId: string) {
    return this.request<{ tasksCreated: number; debtorsProcessed: number; notificationSent: boolean; skippedDuplicate?: boolean }>(
      `/address-tasks/case/${caseId}/trigger-address-workflow`,
      {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }
    );
  }

  /**
   * Adres görevini tamamla
   */
  async completeAddressTask(taskId: string, data: CompleteAddressTaskDTO) {
    return this.request<{ task: AddressTaskDTO }>(`/address-tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Adres görevini iptal et
   */
  async cancelAddressTask(taskId: string, reason: string) {
    return this.request<{ task: AddressTaskDTO }>(`/address-tasks/${taskId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * "Zaten aldık" - Görevi operatör olarak tamamla
   */
  async confirmAddressTaskReceived(taskId: string, operatorId?: string) {
    return this.request<{ task: AddressTaskDTO }>(`/address-tasks/${taskId}/confirm-received`, {
      method: 'POST',
      body: JSON.stringify({ operatorId }),
    });
  }

  /**
   * Borçlunun yararlı adresi var mı kontrol et
   */
  async hasUsefulAddresses(debtorId: string) {
    return this.request<{ hasUsefulAddresses: boolean }>(`/address-tasks/debtor/${debtorId}/has-useful-addresses`);
  }

  /**
   * Adres geldiğinde görevleri otomatik tamamla
   */
  async notifyAddressReceived(caseId: string, debtorId: string, tenantId: string, source: 'CLIENT_REPLY' | 'CLIENT_CONFIRMED_UI' | 'MANUAL_ENTRY') {
    return this.request<{ tasksCompleted: number; tasksCancelled: number }>(
      `/address-tasks/case/${caseId}/debtor/${debtorId}/address-received`,
      {
        method: 'POST',
        body: JSON.stringify({ tenantId, source }),
      }
    );
  }

  // ============================================
  // Client Intake Links (Faz 4.7 PR-B) — personel/JWT
  // Public intake formu (lib/intake-api.ts) AYRI ve AUTH'suz tutulur;
  // BU metodlar authed (request() Bearer token ekler).
  // ============================================

  /**
   * Müvekkil bilgi formu linki üret (+ best-effort INTAKE_LINK maili).
   * rawToken/intakeUrl YALNIZ bu yanıtta döner (tek sefer); liste DÖNDÜRMEZ.
   */
  async createIntakeLink(caseId: string, input: CreateIntakeLinkInput) {
    return this.request<CreateIntakeLinkResult>(`/client-intake-links/case/${caseId}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /** Dosyanın intake linkleri (token/URL DÖNMEZ — güvenlik). */
  async listIntakeLinks(caseId: string, status?: IntakeLinkStatus) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<IntakeLink[]>(`/client-intake-links/case/${caseId}${query}`);
  }

  /** Linki iptal et (ACTIVE → REVOKED). */
  async revokeIntakeLink(id: string) {
    return this.request<IntakeLink>(`/client-intake-links/${id}/revoke`, {
      method: 'POST',
    });
  }

  // ============================================
  // Client Intake Review Queue (Faz 4.7 PR-C1) — personel/JWT, REVIEW-ONLY
  // ⛔ Kanoniğe yazım YOK / promote YOK (4.6 PromotionModule AYRI ve bu istemcide
  // BİLİNÇLİ olarak yer almaz). Bu metodlar yalnız submission/field lifecycle işaretler.
  // ============================================

  /** İnceleme kuyruğu (default CLIENT_SUBMITTED+IN_REVIEW). */
  async listIntakeSubmissions(params?: { status?: IntakeSubmissionStatus; caseId?: string }) {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.caseId) q.set('caseId', params.caseId);
    const qs = q.toString();
    return this.request<IntakeSubmission[]>(`/client-intake-submissions${qs ? `?${qs}` : ''}`);
  }

  /** Tek gönderim + alanlar. */
  async getIntakeSubmission(id: string) {
    return this.request<IntakeSubmissionDetail>(`/client-intake-submissions/${id}`);
  }

  /** İncelemeyi üstlen (CLIENT_SUBMITTED → IN_REVIEW). */
  async claimIntakeSubmission(id: string) {
    return this.request<IntakeSubmission>(`/client-intake-submissions/${id}/claim`, { method: 'POST' });
  }

  /** Tek alan review (APPROVE/REJECT). Döner: güncel submission + alanlar. */
  async reviewIntakeField(fieldId: string, decision: IntakeReviewDecision, note?: string) {
    return this.request<IntakeSubmissionDetail>(`/client-intake-fields/${fieldId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
  }

  /** Toplu alan review (YALNIZ aynı submission). */
  async bulkReviewIntakeFields(id: string, fieldIds: string[], decision: IntakeReviewDecision, note?: string) {
    return this.request<IntakeSubmissionDetail>(`/client-intake-submissions/${id}/fields/bulk-review`, {
      method: 'POST',
      body: JSON.stringify({ fieldIds, decision, note }),
    });
  }

  /** Gönderimi reddet (→ REJECTED; PENDING alanlar REJECTED, APPROVED'a dokunmaz). */
  async rejectIntakeSubmission(id: string, note?: string) {
    return this.request<IntakeSubmissionDetail>(`/client-intake-submissions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  // ============================================
  // Client Intake PROMOTE (Faz 4.7 PR-C2b) — personel/JWT, YALNIZ FIELD-LEVEL.
  // ⛔ KIRMIZI ÇİZGİ: submission-level (toplu / gönderim-düzeyi) promote ucu bu istemciye
  //    EKLENMEZ; UI yalnız alan-bazlı promote eder (CI-7 gate'i yapısal enforce eder).
  //    soft-6 → promote-soft (#178) · ADDRESS → promote-address HYBRID (#168).
  //    ASSET/CONTACT promote ucu YOK (4.6c) → UI'da rozet+disabled.
  // ============================================

  /**
   * TEK soft-intel alanını ClientIntelStatement'a promote et (field-level).
   * <remarks>Çağrıldığı yerler:
   * - intake/[id]/promote/page.tsx (C2b promote ekranı) → POST /client-intake-fields/:fieldId/promote-soft</remarks>
   */
  async promoteSoftField(fieldId: string, debtorId: string) {
    return this.request<PromoteSoftResult>(`/client-intake-fields/${fieldId}/promote-soft`, {
      method: 'POST',
      body: JSON.stringify({ debtorId }),
    });
  }

  /**
   * TEK ADDRESS alanını DebtorAddress'e promote et (HYBRID: ham value korunur, personel structured girer).
   * <remarks>Çağrıldığı yerler:
   * - intake/[id]/promote/page.tsx (C2b promote ekranı) → POST /client-intake-fields/:fieldId/promote-address</remarks>
   */
  async promoteAddressField(fieldId: string, input: PromoteAddressInput) {
    return this.request<PromoteAddressResult>(`/client-intake-fields/${fieldId}/promote-address`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

// ============================================
// Client Intake Link Types (Faz 4.7 PR-B)
// ============================================
export type IntakeLinkStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export type IntakeFieldCategory =
  | 'INCOME_SOURCE'
  | 'COMMERCIAL_RELATION'
  | 'FAMILY_CIRCLE'
  | 'DIGITAL_FOOTPRINT'
  | 'PAYMENT_HISTORY'
  | 'STRATEGY'
  | 'ADDRESS'
  | 'ASSET'
  | 'CONTACT';

export interface IntakeLink {
  id: string;
  tenantId: string;
  caseId: string;
  clientId: string;
  status: IntakeLinkStatus;
  scope: IntakeFieldCategory[];
  expiresAt: string | null;
  maxUses: number;
  useCount: number;
  createdById: string;
  createdAt: string;
}

export interface CreateIntakeLinkInput {
  clientId: string;
  scope: IntakeFieldCategory[];
  expiresAt?: string;
  maxUses?: number;
}

export interface CreateIntakeLinkResult {
  link: IntakeLink;
  rawToken: string;
  intakeUrl: string;
}

// ============================================
// Client Intake Review Types (Faz 4.7 PR-C1) — review-only (promote tipleri YOK)
// ============================================
export type IntakeSubmissionStatus =
  | 'CLIENT_SUBMITTED'
  | 'IN_REVIEW'
  | 'PARTIALLY_PROMOTED'
  | 'COMPLETED'
  | 'REJECTED';

export type IntakeFieldReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type IntakeReviewDecision = 'APPROVE' | 'REJECT';

export interface IntakeSubmission {
  id: string;
  tenantId: string;
  intakeLinkId: string;
  caseId: string;
  clientId: string;
  status: IntakeSubmissionStatus;
  submittedAt: string;
  claimedById: string | null;
  claimedAt: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface IntakeSubmissionField {
  id: string;
  submissionId: string;
  category: IntakeFieldCategory;
  label: string | null;
  value: string;
  note: string | null;
  reviewStatus: IntakeFieldReviewStatus;
  reviewNote: string | null;
  promotedRefType: string | null;
  promotedRefId: string | null;
  promotedAt?: string | null; // Faz 4.7 C2b-pre promote audit damgası (backend dönerse gösterilir; opsiyonel)
  promotedById?: string | null;
  createdAt: string;
}

export interface IntakeSubmissionDetail extends IntakeSubmission {
  fields: IntakeSubmissionField[];
}

// Field-level promote (Faz 4.7 PR-C2b) — YALNIZ field-level; submission-level promote istemcide/UI'da YOK.
export interface PromoteAddressInput {
  debtorId: string;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
}
export interface PromoteSoftResult {
  result: 'PROMOTED';
  clientIntelStatementId: string;
  submissionStatus: IntakeSubmissionStatus;
}
export interface PromoteAddressResult {
  result: 'PROMOTED';
  debtorAddressId: string;
  submissionStatus: IntakeSubmissionStatus;
}

// ============================================
// ValidationGate Types
// ============================================

// PR-D4e-4: haciz öncesi risk seviyesi (read-model; blok değil, karar destek).
export type PreHacizRiskLevel = "YOK" | "DUSUK" | "ORTA" | "YUKSEK";

// PR-D4e-7: haciz gönderim karar-anı audit snapshot'ı (AuditLog.metadata şekli).
export interface HacizAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string | null;
  userName?: string | null;
  description?: string | null;
  createdAt: string;
  metadata?: {
    targetType?: string;
    amount?: number;
    uyapRequestId?: string;
    cpeTraceId?: string | null;
    overallLevel?: PreHacizRiskLevel;
    debtors?: { debtorId: string; name: string; level: PreHacizRiskLevel; reasonIds: string[] }[];
    cpeWarnings?: any[];
  } | null;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationGateResult {
  gateId: string;
  gateName: string;
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  infos: ValidationError[];
  validatedAt: string;
}

export interface ValidationRulesResponse {
  version: number;
  engine: string;
  policies: Record<string, any>;
  case_types: Array<{ code: string; name: string; category: string }>;
  gates: Array<{ id: string; name: string; description: string }>;
}

export interface CheckCompensationInfo {
  defaultOn: boolean;
  rate: number;
  ratePercent: string;
}

export interface AddressSuggestionsResponse {
  createTask: boolean;
  suggestions: string[];
}

// ============================================
// Case Instrument (Cek/Senet) Types
// ============================================

export type InstrumentType = 'CEK' | 'SENET' | 'BONO' | 'POLICE';

export interface CaseInstrument {
  id: string;
  caseId: string;
  instrumentType: InstrumentType;
  serialNo: string;
  issueDate: string;
  maturityDate: string;
  amount: number;
  currency: string;
  bankName?: string;
  branchName?: string;
  accountNo?: string;
  checkNo?: string;
  drawerName?: string;
  drawerIdentityNo?: string;
  endorserName?: string;
  endorserIdentityNo?: string;
  issuerName?: string;
  issuerIdentityNo?: string;
  issuerAddress?: string;
  payeeName?: string;
  payeeIdentityNo?: string;
  guarantorName?: string;
  guarantorIdentityNo?: string;
  protestDate?: string;
  protestNo?: string;
  notes?: string;
  /** A1 Faz 0/1a/2b: kambiyo zinciri (ciranta düğümleri) — { nodes, endorsements } JSON. */
  endorsers?: { nodes?: unknown[]; endorsements?: unknown[] } | null;
  /** A1 Faz 0/2b: aval kenarları — AvalEdge[] JSON. */
  avals?: unknown[] | null;
  createdAt: string;
}

// ============================================
// Case Lease (Kira) Types
// ============================================

export type PropertyType = 'KONUT' | 'ISYERI' | 'ARSA' | 'DIGER';
export type EvictionReason = 'KIRA_BORCU' | 'TAHLIYE_TAAHHUTNAMESI' | 'IHTIYAC' | 'YENIDEN_INSAAT' | 'DIGER';

export interface CaseLease {
  id: string;
  caseId: string;
  propertyType: PropertyType;
  propertyAddress: string;
  propertyCity?: string;
  propertyDistrict?: string;
  leaseStartDate: string;
  leaseEndDate?: string;
  monthlyRent: number;
  rentCurrency: string;
  depositAmount?: number;
  evictionReason?: EvictionReason;
  evictionNoticeDate?: string;
  evictionDeadline?: string;
  unpaidMonths?: number;
  unpaidRentTotal?: number;
  lastPaymentDate?: string;
  landlordName?: string;
  landlordIdentityNo?: string;
  tenantName?: string;
  tenantIdentityNo?: string;
  notes?: string;
  createdAt: string;
}

// ============================================
// Case Judgment (Ilam) Types
// ============================================

export type NafakaType = 'YOKSULLUK' | 'ISTIRAK' | 'TEDBIR' | 'DIGER';

export interface CaseJudgment {
  id: string;
  caseId: string;
  courtName: string;
  courtCity?: string;
  courtType?: string;
  caseNo?: string;
  decisionNo?: string;
  decisionDate: string;
  finalizationDate?: string;
  finalizationNote?: string;
  judgmentAmount?: number;
  judgmentSummary?: string;
  currency: string;
  interestRate?: number;
  interestStartDate?: string;
  requiresFinalization?: boolean;
  isFinalized?: boolean;
  nafakaType?: NafakaType;
  monthlyNafaka?: number;
  nafakaStartDate?: string;
  notes?: string;
  createdAt: string;
}

// ============================================
// Case Collateral (Rehin/Ipotek) Types
// ============================================

export type CollateralType = 'IPOTEK' | 'TASIT_REHNI' | 'TICARI_ISLETME_REHNI' | 'MENKUL_REHNI' | 'DIGER';

export interface CaseCollateral {
  id: string;
  caseId: string;
  collateralType: CollateralType;
  description: string;
  tapuInfo?: string;
  parcelNo?: string;
  blockNo?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyDistrict?: string;
  vehiclePlate?: string;
  vehicleInfo?: string;
  serialNumber?: string;
  estimatedValue?: number;
  mortgageAmount?: number;
  mortgageRank?: number;
  currency: string;
  registrationDate?: string;
  registrationNo?: string;
  notaryName?: string;
  notaryCity?: string;
  notes?: string;
  createdAt: string;
}

// ============================================
// Tebligat Types
// ============================================

export type TebligatType = 'ODEME_EMRI' | 'ICRA_EMRI' | 'TAHLIYE_EMRI' | 'HACIZ_IHBARNAMESI_89_1' | 'HACIZ_IHBARNAMESI_89_2' | 'HACIZ_IHBARNAMESI_89_3' | 'SATIS_ILANI' | 'KIYMET_TAKDIRI' | 'DIGER';
export type TebligatAddressType = 'BILINEN' | 'MERNIS' | 'TICARET_SICIL' | 'KEP' | 'VERGI_DAIRESI';
export type TebligatChannel = 'PTT' | 'KEP' | 'UETS' | 'ILANEN' | 'ELDEN';
export type TebligatStatus = 'HAZIRLANDI' | 'GONDERILDI' | 'TESLIM_EDILDI' | 'IADE_GELDI' | 'MUHTARLIGA_BIRAKILDI' | 'TEBLIG_EDILMIS_SAYILDI' | 'IPTAL';
export type TebligatPttResult = 'TESLIM_EDILDI' | 'AYNI_KONUTTA_TESLIM' | 'ISYERINDE_TESLIM' | 'ADRESTE_BULUNAMADI' | 'TASINMIS' | 'ADRES_YETERSIZ' | 'BINA_YIKILMIS' | 'ADRES_KAPALI' | 'IMTINA' | 'MUHTARLIGA_BIRAKILDI' | 'VEFAT' | 'TANIMIYOR' | 'DIGER';
export type TebligatNextAction = 'MERNIS_TEBLIGAT' | 'ILANEN_TEBLIGAT' | 'TEBLIG_TAMAMLANDI' | 'YENI_ADRES_ARA' | 'BEKLE';

export interface Tebligat {
  id: string;
  caseId: string;
  caseDebtorId?: string;
  tebligatType: TebligatType;
  addressType: TebligatAddressType;
  addressId?: string;
  addressText: string;
  city?: string;
  district?: string;
  recipientName: string;
  recipientTcVkn?: string;
  channel: TebligatChannel;
  status: TebligatStatus;
  barcodeNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  pttResult?: TebligatPttResult;
  pttResultDate?: string;
  pttResultNote?: string;
  tk21Type?: 'TK_21_1' | 'TK_21_2';
  muhtarlikDate?: string;
  ilanDate?: string;
  tebligSayilmaDate?: string;
  nextAction?: TebligatNextAction;
  notes?: string;
  createdAt: string;
}

export interface TebligatSummary {
  total: number;
  hazirlanan: number;
  gonderilen: number;
  teslimEdilen: number;
  iadeGelen: number;
  tebligEdilmisSayilan: number;
  bekleyenIslem: number;
}

export interface PttTrackingResult {
  barcodeNo: string;
  status: string;
  statusCode: string;
  lastUpdate: string;
  deliveryDate?: string;
  recipientName?: string;
  deliveryLocation?: string;
  events: Array<{
    date: string;
    location: string;
    status: string;
    description: string;
  }>;
  mappedResult?: TebligatPttResult;
}

export interface UetsRecipient {
  tcVkn: string;
  name: string;
  kepAddress?: string;
  uetsAddress?: string;
  isRegistered: boolean;
}

// ============================================
// UYAP Types
// ============================================

export type UyapDocumentType = 'TAKIP_TALEBI' | 'DILEKCE' | 'BEYAN' | 'ITIRAZ' | 'HACIZ_TALEBI' | 'DIGER';
export type UyapRequestStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY';
export type HacizTargetType = 'BANK' | 'VEHICLE' | 'PROPERTY' | 'SALARY';

export interface UyapResponse<T = any> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  evkNo?: string;
  requestId: string;
}

export interface UyapStatus {
  connected: boolean;
  mode: 'STUB' | 'LIVE';
  message: string;
  stats: {
    total: number;
    pending: number;
    success: number;
    failed: number;
  };
}

export interface UyapPoaValidation {
  isValid: boolean;
  message: string;
  daysRemaining?: number;
  poaId?: string;
  canProceedToUyap: boolean;
}

export interface UyapCasePoaValidation {
  isValid: boolean;
  errors: string[];
  canProceedToUyap: boolean;
  errorCount: number;
}

export interface UyapRequestLog {
  id: string;
  requestType: string;
  status: UyapRequestStatus;
  evkNo?: string;
  createdAt: string;
  responseAt?: string;
  errorMessage?: string;
}

export interface UyapCaseStatus {
  caseId: string;
  localStatus: string;
  uyapDosyaId?: string;
  uyapStatus: string;
  lastSync: string;
  message: string;
}

export interface UyapDebtorAssets {
  debtorIdentityNo: string;
  queryDate: string;
  assets: {
    bankAccounts: any[];
    vehicles: any[];
    properties: any[];
    companies: any[];
  };
  message: string;
}

// ============================================
// Report Types
// ============================================

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalCollection: number;
  byTakipTuru: Array<{ takipTuru: string; count: number }>;
}

export interface ClientReport {
  total: number;
  byAsama: Array<{ asama: string; count: number; totalAmount: number }>;
  byDurumEtiketi: Array<{ durumEtiketi: string; color?: string; count: number }>;
  byRisk: Array<{ risk: string; color?: string; count: number; totalAmount: number }>;
}

export interface PersonelReport {
  personel: string;
  personelId: string;
  totalCases: number;
  closedCases: number;
  totalCollection: number;
  closureRate: number;
  // M2-G5b: gerçek kişi (LAWYER/STAFF) vs legacy (LEGACY_USER) ayrımı. Eski response'larda yok → opsiyonel.
  ownerType?: "LAWYER" | "STAFF" | "LEGACY_USER";
  ownerId?: string;
}

export interface RiskReport {
  summary: Array<{ risk: string; color?: string; count: number; totalAmount: number }>;
  cases: Array<{
    id: string;
    fileNumber: string;
    principalAmount: number;
    riskScore?: number;
    risk?: string;
    riskColor?: string;
    asama?: string;
    durumEtiketi?: string;
    caseStatus: string;
  }>;
}

export interface RiskSummary {
  totalActive: number;
  distribution: Array<{
    id: string | null;
    code: string;
    name: string;
    color: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
  summary: {
    high: number;
    medium: number;
    low: number;
    unassigned: number;
  };
}

export interface GroupReport {
  group: { id: string; name: string; color?: string };
  totalCases: number;
  totalAmount: number;
  totalCollection: number;
  collectionRate: number;
  byAsama: Array<{ asama: string; count: number }>;
}

export interface CaseDebtReport {
  caseInfo: {
    id: string;
    fileNumber: string;
    executionFileNumber?: string;
    clientName: string;
    status: string;
    openDate: string;
  };
  debtors: Array<{
    id: string;
    name: string;
    tcNo?: string;
    role: string;
  }>;
  claimDetails: {
    principalAmount: number;
    currency: string;
    interestAmount: number;
    interestRate?: number;
    interestType?: string;
    interestStartDate?: string;
    interestEndDate: string;
    expenseAmount: number;
    feeAmount: number;
    attorneyFeeAmount: number;
    otherAmount: number;
    totalClaim: number;
  };
  collectionDetails: {
    totalCollected: number;
    collectionCount: number;
    byType: Record<string, number>;
    lastCollectionDate?: string;
  };
  balance: {
    remainingDebt: number;
    remainingPrincipal: number;
    remainingInterest: number;
    remainingExpense: number;
    remainingFee: number;
    remainingAttorneyFee: number;
  };
  calculationDate: string;
  generatedAt: string;
}

export interface InterestReport {
  caseInfo: {
    id: string;
    fileNumber: string;
    principalAmount: number;
    currency: string;
  };
  interestDetails: {
    type: string;
    rate: number;
    startDate: string;
    endDate: string;
    days: number;
    calculatedAmount: number;
  };
  dailyBreakdown: Array<{
    date: string;
    principal: number;
    rate: number;
    dailyInterest: number;
    cumulativeInterest: number;
  }>;
  summary: {
    totalDays: number;
    averageRate: number;
    totalInterest: number;
  };
  generatedAt: string;
}

export interface CollectionHistoryReport {
  summary: {
    totalCollected: number;
    totalPending: number;
    totalCancelled: number;
    collectionCount: number;
    averageAmount: number;
  };
  byChannel: Array<{ channel: string; count: number; total: number; percentage: number }>;
  bySource: Array<{ source: string; count: number; total: number; percentage: number }>;
  byMonth: Array<{ month: string; count: number; total: number }>;
  collections: Array<{
    id: string;
    date: string;
    amount: number;
    currency: string;
    channel: string;
    source?: string;
    status: string;
    caseFileNumber?: string;
    description?: string;
  }>;
  generatedAt: string;
}

export interface CollectionSummary {
  period: string;
  periodTotal: number;
  periodCount: number;
  allTimeTotal: number;
  pendingTotal: number;
  pendingCount: number;
}

// ============================================
// E-Sign Types
// ============================================

export type ESignProvider = 'E_GUVEN' | 'TURKCELL' | 'E_TUGRA';
export type ESignStatus = 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED' | 'ERROR';

export interface ESignRequest {
  documentId: string;
  documentName: string;
  documentContent: string;
  signerId: string;
  signerName: string;
  signerTcNo: string;
  provider?: ESignProvider;
  callbackUrl?: string;
}

export interface ESignResponse {
  success: boolean;
  requestId?: string;
  signUrl?: string;
  errorMessage?: string;
  provider: ESignProvider;
}

export interface ESignStatusResponse {
  requestId: string;
  status: ESignStatus;
  signedAt?: string;
  signedDocument?: string;
  errorMessage?: string;
}

export interface ESignLog {
  id: string;
  caseId?: string;
  documentId: string;
  documentName: string;
  signerId: string;
  signerName: string;
  provider: ESignProvider;
  status: ESignStatus;
  requestId?: string;
  signedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

// ============================================
// Bank Types
// ============================================

export type BankProvider = 'GARANTI' | 'AKBANK' | 'ISBANK' | 'YAPI_KREDI' | 'ZIRAAT' | 'VAKIF' | 'HALK' | 'DIGER';
export type BankTransactionType = 'INCOMING' | 'OUTGOING';
export type BankTransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Summary Engine Types
export interface SummaryResult {
  caseId: string;
  asOfDate: string;
  currency: string;
  sections: SectionResult[];
  totals: {
    takipTutari: number;
    icraMasraflari: number;
    vekaletUcreti: number;
    takipSonrasiFaiz: number;
    toplamBorc: number;
    toplamTahsilat: number;
    sonBorc: number;
  };
  alternativeScenarios: Array<{
    rate: number;
    label: string;
    amount: number;
  }>;
  items: ClaimItemSummary[];
}

export interface SectionResult {
  key: string;
  label: string;
  color?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  lines: LineResult[];
  sectionTotal: number;
}

export interface LineResult {
  key: string;
  label: string;
  amount: number;
  originalAmount?: number;
  collectedAmount?: number;
  remainingAmount?: number;
  bold?: boolean;
  highlight?: boolean;
  note?: string;
  color?: string;
  size?: string;
  italic?: boolean;
  hidden?: boolean;
}

export interface ClaimItemSummary {
  id: string;
  itemType: string;
  label: string;
  originalAmount: number;
  demandedAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  bucket: string;
  status: string;
}

export interface BankAccount {
  id: string;
  tenantId: string;
  bankProvider: BankProvider;
  accountName: string;
  iban: string;
  currency: string;
  balance?: number;
  lastSyncAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  transactionType: BankTransactionType;
  amount: number;
  currency: string;
  description?: string;
  senderName?: string;
  senderIban?: string;
  receiverName?: string;
  receiverIban?: string;
  referenceNo?: string;
  transactionDate: string;
  valueDate?: string;
  status: BankTransactionStatus;
  matchedCaseId?: string;
  matchedCollectionId?: string;
  isAutoMatched: boolean;
  createdAt: string;
}

export interface BankBalanceResponse {
  iban: string;
  balance: number;
  currency: string;
  availableBalance: number;
  lastUpdate: string;
}

export interface BankTransferRequest {
  fromIban: string;
  toIban: string;
  amount: number;
  currency: string;
  description?: string;
  receiverName: string;
}

export interface BankTransferResponse {
  success: boolean;
  referenceNo?: string;
  errorMessage?: string;
  status: BankTransactionStatus;
}

// ============================================
// Template Engine Types
// ============================================

export interface TemplateData {
  fileNumber: string;
  filingDate: string;
  executionNumber?: string;
  executionOffice: { name: string; city: string; uyapCode?: string };
  creditors: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string }>;
  lawyers: Array<{ name: string; barNumber: string; barCity: string; address?: string }>;
  debtors: Array<{ type: 'INDIVIDUAL' | 'COMPANY'; name: string; identityNo?: string; taxNo?: string; address?: string; role?: string }>;
  claimItems: Array<{ type: string; description: string; amount: number; currency: string; dueDate?: string }>;
  totals: { principal: number; interest: number; fees: number; total: number; currency: string };
  interestInfo: { type: 'YASAL' | 'TICARI' | 'CUSTOM'; rate?: number; description: string; variableRate: boolean };
  caseType: string;
  subCategory: string;
  executionPath: string;
  sourceDocument?: { type: string; number?: string; date?: string; bank?: string; branch?: string };
}

export interface GeneratedDocument {
  title: string;
  content: string;
  format: 'text' | 'html';
  templateCode: string;
}

export interface UdfDocument {
  version: string;
  documentType: string;
  documentCode: string;
  createdAt: string;
  metadata: {
    fileNumber: string;
    executionOfficeCode?: string;
    caseType: string;
    subCategory: string;
  };
  content: {
    sections: Array<{
      type: string;
      title?: string;
      data: Record<string, any>;
    }>;
  };
  signature?: {
    lawyerBarNumber: string;
    lawyerName: string;
    timestamp: string;
  };
}

// ============================================
// Payment Instruction Types
// ============================================

export interface PaymentInstructionResult {
  bankName: string;
  iban: string;
  ibanFormatted: string;
  description: string;
  executionOfficeName: string;
  executionFileNumber: string;
  amount: number;
  purpose: string;
  purposeLabel: string;
  warnings?: string[];
}

// Singleton export
export const api = new ApiClient();

// ============================================
// Address Task Types
// ============================================

export type AddressTaskType =
  | 'DOC_EXTRACT_DEBTOR_ADDRESSES'
  | 'CLIENT_CONTACT_VALIDATE'
  | 'CLIENT_REQUEST_DEBTOR_ADDRESSES'
  | 'CLIENT_REMIND_DEBTOR_ADDRESSES'
  | 'CLIENT_ANNUAL_ADDRESS_REFRESH'
  | 'ASSIGN_MANUAL_CALL_CLIENT'
  | 'MANUAL_CLIENT_FOLLOWUP'
  | 'UYAP_PULL_MERNIS'
  | 'UYAP_PULL_SGK';

export type AddressTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'WAITING_EXTERNAL'
  | 'OVERDUE'
  | 'RESOLVED'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

export interface AddressTaskDTO {
  id: string;
  tenantId: string;
  caseId: string;
  debtorId: string;
  taskType: AddressTaskType;
  status: AddressTaskStatus;
  title?: string;
  description?: string;
  dueAt?: string;
  attemptCount: number;
  maxAttempts: number;
  resultType?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AddressNoteDTO {
  id: string;
  content: string;
  createdAt: string;
  createdBy: { name: string };
  type: 'SISTEM' | 'AVUKAT' | 'MUVEKKIL';
  action?: string;
  details?: Record<string, any>;
}

export interface CompleteAddressTaskDTO {
  resultType: 'POSITIVE' | 'NEGATIVE' | 'PARTIAL' | 'TIMEOUT' | 'MANUAL_OVERRIDE';
  resultData?: Record<string, any>;
  resolution?: string;
  resolutionNotes?: string;
}

// ============================================
// Expense Request Types
// ============================================

export type ExpenseRequestStatus = 'PENDING' | 'SENT' | 'REMINDED' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';

// ============================================
// Address Discovery Types
// ============================================

export type ClientInfoRequestStatus = 'SENT' | 'RESPONDED' | 'NO_RESPONSE';
export type UyapQueryStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'NO_RESULT';
export type UyapQueryType = 'NUFUS_ADRES' | 'SGK' | 'TICARET_ODASI' | 'VERGI_DAIRESI' | 'GSM' | 'GUMRUK' | 'ORTAKLAR' | 'AILE' | 'ORTAK_DETAY';
export type InstitutionType = 'SGK' | 'VERGI_DAIRESI' | 'TICARET_SICILI' | 'BELEDIYE' | 'TAPU' | 'NUFUS';
export type InstitutionLetterStatus = 'DRAFT' | 'SENT' | 'RESPONDED' | 'NO_RESPONSE';
export type AddressResearchStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXHAUSTED';

export interface CreateClientInfoRequestDTO {
  caseId: string;
  clientId: string;
  debtorId?: string;
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface ClientInfoRequestDTO {
  id: string;
  caseId: string;
  clientId: string;
  debtorId?: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  status: ClientInfoRequestStatus;
  sentAt: string;
  respondedAt?: string;
  responseNotes?: string;
  reminderCount: number;
  reminderSentAt?: string;
  client?: { id: string; displayName: string };
  debtor?: { id: string; name: string };
}

export interface CreateUyapQueryDTO {
  caseDebtorId: string;
  queryType: UyapQueryType;
  notes?: string;
}

export interface UyapQueryDTO {
  id: string;
  caseDebtorId: string;
  queryType: UyapQueryType;
  queryCode: string;
  status: UyapQueryStatus;
  requestedAt: string;
  respondedAt?: string;
  response?: any;
  errorMessage?: string;
  addressesFound: number;
  requestedByUser?: { name: string; surname: string };
  caseDebtor?: {
    debtor: { id: string; name: string };
    case: { id: string; fileNumber: string };
  };
}

export interface UpdateUyapQueryResponseDTO {
  status: 'COMPLETED' | 'FAILED' | 'NO_RESULT';
  response?: any;
  errorMessage?: string;
  addresses?: AddressFromQueryDTO[];
}

export interface AddressFromQueryDTO {
  fullAddress: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  street?: string;
  buildingNo?: string;
  apartmentNo?: string;
  postalCode?: string;
  addressType?: string;
}

export interface UyapQuerySuggestion {
  queryType: UyapQueryType;
  queryCode: string;
  name: string;
  priority: number;
}

export interface UyapQueryTypeInfo {
  type: UyapQueryType;
  code: string;
  name: string;
  forIndividual: boolean;
  forCompany: boolean;
}

export interface CreateInstitutionLetterDTO {
  caseDebtorId: string;
  institution: InstitutionType;
  letterType: string;
  subject?: string;
  body?: string;
  recipientName?: string;
  recipientAddress?: string;
}

export interface InstitutionLetterDTO {
  id: string;
  caseDebtorId: string;
  institution: InstitutionType;
  letterType: string;
  subject: string;
  body: string;
  documentUrl?: string;
  status: InstitutionLetterStatus;
  sentAt?: string;
  sentMethod?: string;
  respondedAt?: string;
  responseNotes?: string;
  addressesFound: number;
  createdAt: string;
  caseDebtor?: {
    debtor: { id: string; name: string };
    case: { id: string; fileNumber: string };
  };
}

export interface MarkLetterAsSentDTO {
  sentMethod: string;
  trackingNumber?: string;
  notes?: string;
}

export interface MarkLetterAsRespondedDTO {
  responseNotes?: string;
  addressesFound?: number;
  addresses?: AddressFromQueryDTO[];
}

export interface InstitutionTemplateInfo {
  institution: InstitutionType;
  name: string;
  letterTypes: string[];
  defaultSubject: string;
}

export interface CrossFileMatch {
  caseId: string;
  fileNumber: string;
  debtorId: string;
  debtorName: string;
  addressCount: number;
}

export interface CrossFileAddressDTO {
  id: string;
  fullText: string;
  city: string;
  district?: string;
  type: string;
  source: string;
  verified: boolean;
  fromCase: {
    id: string;
    fileNumber: string;
  };
}

export interface ConfidenceScoreBreakdown {
  totalScore: number;
  factors: {
    sourceReliability: { score: number; weight: number; source: string };
    verification: { score: number; weight: number; verified: boolean };
    recency: { score: number; weight: number; daysSinceUpdate: number };
    notificationSuccess: { score: number; weight: number; successRate: number };
  };
}

export interface AddressResearchDTO {
  id: string;
  caseDebtorId: string;
  status: AddressResearchStatus;
  clientInfoRequested: boolean;
  uyapQueriesCompleted: boolean;
  crossFileChecked: boolean;
  institutionLettersSent: boolean;
  totalAddressesFound: number;
  failedNotifications: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ResearchSuggestion {
  action: string;
  priority: number;
  reason: string;
  actionLabel?: string;
}

export interface ResearchTimelineItem {
  id: string;
  type: 'CLIENT_INFO' | 'UYAP_QUERY' | 'INSTITUTION_LETTER' | 'CROSS_FILE' | 'ADDRESS_ADDED';
  title: string;
  description: string;
  status: string;
  date: string;
  metadata?: any;
}

export interface ExpenseItem {
  type: string;
  description: string;
  amount: number;
}

export interface ExpenseRequest {
  id: string;
  tenantId: string;
  caseId: string;
  clientId: string;
  items: ExpenseItem[];
  totalAmount: number;
  currency: string;
  dueDate?: string;
  status: ExpenseRequestStatus;
  sentAt?: string;
  sentVia?: string;
  reminderCount: number;
  lastReminderAt?: string;
  paidAt?: string;
  paidAmount?: number;
  receiptDocId?: string;
  notes?: string;
  createdAt: string;
  case?: { id: string; fileNumber: string; executionFileNumber?: string };
  client?: { id: string; name: string; displayName?: string; phone?: string; email?: string };
}

// ============================================
// Message Template Types
// ============================================

export type MessageTemplateCategory = 'CLIENT_INFO' | 'EXPENSE_REQUEST' | 'EXPENSE_REMINDER' | 'COLLECTION_INFO' | 'DEBTOR_NOTICE' | 'GREETING' | 'OTHER';
export type MessageTemplateChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface MessageTemplate {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  category: MessageTemplateCategory;
  channel: MessageTemplateChannel;
  subject?: string;
  body: string;
  availableTokens?: string[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
}

// ============================================
// Case Debtor Types (FAZ 1 - Borçlu Modülü)
// ============================================

export type ServiceStatus = 
  | "NOT_STARTED" 
  | "READY" 
  | "SENT" 
  | "DELIVERED" 
  | "RETURNED" 
  | "MUHTAR" 
  | "ANNOUNCEMENT" 
  | "FAILED" 
  | "UNKNOWN"
  | "FINALIZED"; // Kesinleşti - tebliğ + yasal süre dolmuş

export type ServiceReturnReason = 
  | "ADDRESS_NOT_FOUND" 
  | "MOVED" 
  | "REFUSED" 
  | "DECEASED" 
  | "COMPANY_CLOSED" 
  | "UNCLAIMED" 
  | "OTHER";

export type AssetQueryStatus = "UNKNOWN" | "YES" | "NO" | "PENDING" | "ERROR";

// Asset Query Types (FAZ 4)
export type AssetQueryType = 
  | "VEHICLE" 
  | "REAL_ESTATE" 
  | "BANK" 
  | "SGK_WAGE" 
  | "SGK_EMPLOYER" 
  | "TAX" 
  | "TRADE_REGISTRY" 
  | "GSM";

export type AssetQueryJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface RunAssetQueriesDTO {
  types: AssetQueryType[];
  reason?: string;
  idempotencyKey?: string;
}

export interface UpdateAssetQueryResultDTO {
  result: AssetQueryStatus;
  resultData?: Record<string, any>;
  errorMessage?: string;
}

export interface AssetQueryDTO {
  id: string;
  queryType: AssetQueryType;
  status: AssetQueryJobStatus;
  result: AssetQueryStatus | null;
  resultData: Record<string, any> | null;
  errorMessage: string | null;
  reason: string | null;
  requestedAt: string;
  requestedBy: string;
  requestedByName: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AssetSummaryDTO {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt: string | null;
  pendingQueries: number;
}

export const AssetQueryTypeLabels: Record<AssetQueryType, string> = {
  VEHICLE: 'Araç Sorgusu',
  REAL_ESTATE: 'Tapu Sorgusu',
  BANK: 'Banka Hesabı',
  SGK_WAGE: 'SGK Maaş',
  SGK_EMPLOYER: 'SGK İşveren',
  TAX: 'Vergi Dairesi',
  TRADE_REGISTRY: 'Ticaret Sicil',
  GSM: 'GSM Operatör',
};

export const AssetQueryJobStatusLabels: Record<AssetQueryJobStatus, string> = {
  QUEUED: 'Kuyruğa Alındı',
  PROCESSING: 'İşleniyor',
  COMPLETED: 'Tamamlandı',
  FAILED: 'Başarısız',
  CANCELLED: 'İptal Edildi',
};

export const AssetQueryStatusLabels: Record<AssetQueryStatus, string> = {
  UNKNOWN: 'Bilinmiyor',
  YES: 'Var',
  NO: 'Yok',
  PENDING: 'Sorgulanıyor',
  ERROR: 'Hata',
};

export type DebtorRole = 
  | "ASIL_BORCLU" 
  | "MUSTEREK_BORCLU" 
  | "KEFIL" 
  | "AVALIST" 
  | "MIRASCI" 
  | "TEMSILCI" 
  | "DIGER";

export type AlertLevel = "NONE" | "INFO" | "WARN" | "DANGER";

export type DebtorIssueCode =
  | "MISSING_ADDRESS"
  | "MISSING_TCKN"
  | "MISSING_VKN"
  | "NO_CONTACT"
  | "SERVICE_NOT_STARTED"
  | "SERVICE_STUCK"
  | "RETURN_REASON_MISSING"
  | "DELIVERED_DATE_MISSING"
  | "SERVICE_FAILED"
  | "RISK_CONCORDAT"
  | "RISK_BANKRUPTCY"
  | "RISK_ADDRESS_SUSPECT"
  | "STALE_30D"
  | "NO_ASSET_QUERY";

export interface DebtorIssue {
  code: DebtorIssueCode;
  level: AlertLevel;
  label: string;
}

export interface DebtorsSummaryDTO {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  danger: number;
}

export interface DebtorListItemDTO {
  id: string;
  caseDebtorId: string;
  displayName: string;
  personType: "REAL" | "LEGAL";
  role: DebtorRole;
  lifecycleStatus: "ACTIVE" | "PASSIVE";
  identityMasked?: string;
  phoneMasked?: string;
  addressShort?: string;
  serviceStatus: ServiceStatus;
  /** Pre-computed label with date, e.g. "Tebliğ Edildi — 12.01.2026" */
  serviceLabel: string;
  /** Tebliğ tarihi - hukuki süreler için kritik */
  deliveredAt?: string;
  /** Kesinleşme tarihi - tebliğ + yasal süre (genellikle 7-14 gün) */
  finalizationDate?: string;
  assets: AssetsDTO;
  alertCount: number;
  alertLevel: AlertLevel;
  issues: DebtorIssue[];
  /** Cross-file: Bu borçlunun başka dosyalarda farklı adresi var mı? */
  hasDifferentAddressInOtherCase?: boolean;
  /** Address research status */
  researchStatus?: AddressResearchStatus;
}

export interface ServiceDTO {
  status: ServiceStatus;
  channel?: string;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: ServiceReturnReason;
}

export interface AssetsDTO {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt?: string;
}

// ==================== ADDRESS TYPES (Tebligat Kanunu) ====================

export type AddressType = 
  | "MERNIS"          // MERNİS Yerleşim Yeri (TK m.10/m.21)
  | "BUSINESS_HQ"     // İşyeri Merkez (TK m.12/m.13)
  | "BUSINESS_BRANCH" // İşyeri Şube
  | "LEGAL_CENTER"    // Tüzel Kişi Merkez (Ticaret Sicili)
  | "DECLARED"        // Bildirilen/Sözleşme Adresi (TK m.10/2)
  | "KEP";            // Kayıtlı Elektronik Posta Adresi

export type AddressSubType = "HQ" | "BRANCH";

export type AddressSource = 
  | "MERNIS"          // MERNİS sorgusu
  | "MERSIS"          // MERSİS sorgusu
  | "TICARET_SICILI"  // Ticaret Sicil Gazetesi
  | "CONTRACT"        // Sözleşme
  | "USER_INPUT"      // Manuel giriş
  | "UYAP";           // UYAP sorgusu

export type AddressRiskFlag = 
  | "ADDRESS_SUSPECT" // Adres şüpheli
  | "MOVED"           // Taşınmış
  | "CLOSED"          // Kapalı
  | "NOT_FOUND"       // Bulunamadı
  | "REFUSED";        // Tebellüğden imtina

export type LegalPriority = "HIGH" | "MEDIUM" | "LOW";

export type VerificationStatus = "NOT_VERIFIED" | "PENDING" | "VERIFIED" | "FAILED" | "OUTDATED";

export interface AddressDTO {
  id: string;
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  fullText: string;
  legalPriority: LegalPriority;
  canApply21_2: boolean;
  verified: boolean;
  verifiedAt?: string;
  riskFlags: AddressRiskFlag[];
  isPrimary: boolean;
  tk21_2Applied: boolean;
  lastNotificationResult?: {
    date: string;
    status: string;
  };
  // Verification status
  verificationStatus?: VerificationStatus;
  verificationMessage?: string;
  daysSinceVerification?: number;
  // Confidence score (0-100)
  confidenceScore?: number;
}

export interface VerificationResultDTO {
  success: boolean;
  verified: boolean;
  source: AddressSource;
  message: string;
  newAddress?: {
    street: string;
    city: string;
    district?: string;
    postalCode?: string;
  };
  verifiedAt: string;
}

export interface BulkVerificationResultDTO {
  total: number;
  verified: number;
  failed: number;
  results: Array<{
    addressId: string;
    type: AddressType;
    result: VerificationResultDTO;
  }>;
}

// Phase 2: Next Address Suggestion
export interface NextAddressSuggestionDTO {
  nextAddress: AddressDTO | null;
  suggestion: string;
  canApplyTK21_2: boolean;
  shouldAnnounce: boolean;
}

// Phase 3: Address Success Stats
export interface AddressStatsDTO {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastAttemptDate?: string;
  lastResult?: string;
}

export interface AddressWithStatsDTO extends AddressDTO {
  stats: {
    totalAttempts: number;
    successRate: number;
    lastResult?: string;
  };
}

// Phase 4: Notification Chain
export interface NotificationChainDTO {
  addresses: Array<{
    address: AddressDTO;
    attemptCount: number;
    lastAttempt?: {
      date: string;
      status: string;
      returnReason?: string;
    };
    isExhausted: boolean;
    nextInChain: boolean;
  }>;
  currentAddressId?: string;
  totalAttempts: number;
  exhaustedCount: number;
  remainingCount: number;
  chainStatus: 'ACTIVE' | 'EXHAUSTED' | 'DELIVERED';
  recommendation: string;
}

export interface CreateAddressDTO {
  type: AddressType;
  subType?: AddressSubType;
  source: AddressSource;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
}

export interface UpdateAddressDTO {
  type?: AddressType;
  subType?: AddressSubType;
  source?: AddressSource;
  street?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  verified?: boolean;
  riskFlags?: AddressRiskFlag[];
}

export interface TK21_2RecordDTO {
  muhtarDeliveryDate: string;
  doorPostingDate: string;
  noticeDate: string;
  notes?: string;
}

export const AddressTypeLabels: Record<AddressType, string> = {
  MERNIS: "MERNİS Yerleşim Yeri",
  BUSINESS_HQ: "İşyeri Merkez",
  BUSINESS_BRANCH: "İşyeri Şube",
  LEGAL_CENTER: "Şirket Merkez (Ticaret Sicili)",
  DECLARED: "Bildirilen Adres",
  KEP: "KEP Adresi",
};

export const AddressTypeIcons: Record<AddressType, string> = {
  MERNIS: "🏠",
  BUSINESS_HQ: "🏢",
  BUSINESS_BRANCH: "🏬",
  LEGAL_CENTER: "🏛️",
  DECLARED: "✍️",
  KEP: "📧",
};

export const AddressSourceLabels: Record<AddressSource, string> = {
  MERNIS: "MERNİS Sorgusu",
  MERSIS: "MERSİS Sorgusu",
  TICARET_SICILI: "Ticaret Sicil Gazetesi",
  CONTRACT: "Sözleşme",
  USER_INPUT: "Manuel Giriş",
  UYAP: "UYAP Sorgusu",
};

export const AddressRiskFlagLabels: Record<AddressRiskFlag, string> = {
  ADDRESS_SUSPECT: "Adres Şüpheli",
  MOVED: "Taşınmış",
  CLOSED: "Kapalı",
  NOT_FOUND: "Bulunamadı",
  REFUSED: "Tebellüğden İmtina",
};

export const LegalPriorityLabels: Record<LegalPriority, string> = {
  HIGH: "Yüksek Öncelik",
  MEDIUM: "Orta Öncelik",
  LOW: "Düşük Öncelik",
};

export interface DebtorDetailDTO extends DebtorListItemDTO {
  emailMasked?: string;
  // Full contact info (unmasked) for detail view
  phone?: string;
  email?: string;
  identityNo?: string;
  address?: string;
  addresses?: AddressDTO[];  // Tebligat Kanunu'na uygun adres listesi
  selectedAddressId?: string; // Aktif tebligat adresi
  service: ServiceDTO;
  assets: AssetsDTO;
  riskFlags: string[];
  staleDays?: number;
  quickNote?: string;
  issues: DebtorIssue[];
}

export interface CaseDebtorsResponse {
  summary: DebtorsSummaryDTO;
  items: DebtorListItemDTO[];
}

// Label maps for UI
export const ServiceStatusLabels: Record<ServiceStatus, string> = {
  NOT_STARTED: "Başlatılmadı",
  READY: "Hazır",
  SENT: "Gönderildi",
  DELIVERED: "Tebliğ Edildi",
  RETURNED: "İade",
  MUHTAR: "Muhtara Teslim",
  ANNOUNCEMENT: "İlan Yoluyla",
  FAILED: "Başarısız",
  UNKNOWN: "Bilinmiyor",
  FINALIZED: "Kesinleşti",
};

export const ServiceReturnReasonLabels: Record<ServiceReturnReason, string> = {
  ADDRESS_NOT_FOUND: "Adres Bulunamadı",
  MOVED: "Taşınmış",
  REFUSED: "Reddetti",
  DECEASED: "Vefat",
  COMPANY_CLOSED: "Şirket Kapandı",
  UNCLAIMED: "Alınmadı",
  OTHER: "Diğer",
};

export const DebtorRoleLabels: Record<DebtorRole, string> = {
  ASIL_BORCLU: "Asıl Borçlu",
  MUSTEREK_BORCLU: "Müşterek Borçlu",
  KEFIL: "Kefil",
  AVALIST: "Avalist",
  MIRASCI: "Mirasçı",
  TEMSILCI: "Temsilci",
  DIGER: "Diğer",
};

// FAZ 2 - Tebligat Yönetimi Types
export type ServiceChannel = "PHYSICAL" | "UETS" | "KEP" | "UNKNOWN";

export const ServiceChannelLabels: Record<ServiceChannel, string> = {
  PHYSICAL: "PTT / Fiziksel",
  UETS: "UETS",
  KEP: "KEP",
  UNKNOWN: "Bilinmiyor",
};

export interface UpdateServiceStatusDTO {
  status: ServiceStatus;
  channel?: ServiceChannel;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: ServiceReturnReason;
  note?: string;
  directEntry?: boolean; // Skip state machine validation for manual date entry
  // Address tracking
  addressId?: string;
  // TK 21/2 fields
  applyTK21_2?: boolean;
  tk21_2MuhtarDate?: string;
  tk21_2DoorPostDate?: string;
  tk21_2NoticeDate?: string;
}

export interface ServiceHistoryItem {
  id: string;
  fromStatus: ServiceStatus;
  toStatus: ServiceStatus;
  channel?: string;
  trackingNo?: string;
  actionDate?: string;
  returnReason?: string;
  note?: string;
  createdAt: string;
  createdBy?: string;
  // Address info (TK compliance)
  addressId?: string;
  addressType?: AddressType;
  addressText?: string;
}

// Valid status transitions for UI validation
export const ServiceStatusTransitions: Record<ServiceStatus, ServiceStatus[]> = {
  NOT_STARTED: ["READY", "FAILED"],
  READY: ["SENT", "FAILED"],
  SENT: ["DELIVERED", "RETURNED", "MUHTAR", "FAILED"],
  DELIVERED: [], // Terminal - kesinleşme otomatik hesaplanır
  RETURNED: ["READY", "FAILED"],
  MUHTAR: ["DELIVERED", "FAILED"],
  ANNOUNCEMENT: ["DELIVERED", "FAILED"],
  FAILED: ["READY"],
  UNKNOWN: ["NOT_STARTED", "READY", "SENT", "DELIVERED", "RETURNED", "MUHTAR", "ANNOUNCEMENT", "FAILED"],
  FINALIZED: [], // Terminal - kesinleşmiş dosya
};

// TypeScript icin ApiClient'a method tanimlari ekleme
declare module './api' {
  interface ApiClient {
    // E-Sign methods
    signDocument(data: ESignRequest): Promise<ESignResponse>;
    getSignStatus(requestId: string): Promise<ESignStatusResponse>;
    getSignLogs(caseId?: string): Promise<ESignLog[]>;
    getAvailableSignProviders(): Promise<{ providers: ESignProvider[]; default: ESignProvider }>;
    cancelSignRequest(requestId: string): Promise<{ success: boolean; message: string }>;
    
    // Bank methods
    getBankAccounts(): Promise<BankAccount[]>;
    createBankAccount(data: Omit<BankAccount, 'id' | 'tenantId' | 'createdAt' | 'lastSyncAt'>): Promise<BankAccount>;
    updateBankAccount(id: string, data: Partial<BankAccount>): Promise<BankAccount>;
    deleteBankAccount(id: string): Promise<void>;
    getBankBalance(iban: string): Promise<BankBalanceResponse>;
    syncBankBalance(accountId: string): Promise<BankBalanceResponse>;
    getBankTransactions(filters?: {
      accountId?: string;
      startDate?: string;
      endDate?: string;
      type?: BankTransactionType;
      status?: BankTransactionStatus;
      unmatched?: boolean;
    }): Promise<BankTransaction[]>;
    syncBankTransactions(accountId: string, startDate?: string, endDate?: string): Promise<{ count: number; transactions: BankTransaction[] }>;
    matchTransactionToCase(transactionId: string, caseId: string): Promise<{ success: boolean; collectionId?: string }>;
    unmatchTransaction(transactionId: string): Promise<{ success: boolean }>;
    autoMatchTransactions(): Promise<{ matched: number; unmatched: number }>;
    sendBankTransfer(data: BankTransferRequest): Promise<BankTransferResponse>;
    getTransferStatus(referenceNo: string): Promise<{ referenceNo: string; status: BankTransactionStatus; completedAt?: string }>;
    getBankIntegrationStatus(): Promise<{ connected: boolean; providers: BankProvider[]; lastSync?: string }>;
    
    // Expense Request methods
    getExpenseRequests(params?: { caseId?: string; clientId?: string; status?: ExpenseRequestStatus }): Promise<ExpenseRequest[]>;
    getExpenseRequest(id: string): Promise<ExpenseRequest>;
    getExpenseRequestsByCase(caseId: string): Promise<ExpenseRequest[]>;
    createExpenseRequest(data: { caseId: string; clientId: string; items: ExpenseItem[]; dueDate?: string; notes?: string }): Promise<ExpenseRequest>;
    updateExpenseRequest(id: string, data: Partial<ExpenseRequest>): Promise<ExpenseRequest>;
    sendExpenseRequest(id: string, channel: string): Promise<ExpenseRequest>;
    remindExpenseRequest(id: string): Promise<ExpenseRequest>;
    receiveExpenseRequest(id: string, paidAmount: number, receiptDocId?: string): Promise<ExpenseRequest>;
    cancelExpenseRequest(id: string, reason?: string): Promise<ExpenseRequest>;
    deleteExpenseRequest(id: string): Promise<{ success: boolean }>;
    getExpenseRequestStats(caseId?: string): Promise<{ pending: number; sent: number; received: number; totalReceived: number }>;
    
    // Message Template methods
    getMessageTemplates(params?: { category?: MessageTemplateCategory; channel?: MessageTemplateChannel; isActive?: boolean }): Promise<MessageTemplate[]>;
    getMessageTemplate(id: string): Promise<MessageTemplate>;
    getMessageTemplateByCode(code: string): Promise<MessageTemplate>;
    createMessageTemplate(data: Omit<MessageTemplate, 'id' | 'tenantId' | 'createdAt' | 'isSystem' | 'sortOrder'>): Promise<MessageTemplate>;
    updateMessageTemplate(id: string, data: Partial<MessageTemplate>): Promise<MessageTemplate>;
    deleteMessageTemplate(id: string): Promise<{ success: boolean }>;
    renderMessageTemplate(id: string, tokens: Record<string, string>): Promise<{ subject?: string; body: string }>;
    seedMessageTemplates(): Promise<{ success: boolean; message: string }>;
  }
}

// ============================================
// UYAP Export Types
// ============================================

export interface UyapExportResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  caseCount: number;
  xml?: string;
  downloadUrl?: string;
  errors?: string[];
  warnings?: string[];
}

export interface UyapValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UyapExportableCasesResult {
  cases: Array<{
    id: string;
    fileNumber: string;
    clientName: string;
    debtorCount: number;
    hasWarnings: boolean;
  }>;
  total: number;
}

// ============================================
// Due (Alacak Kalemi) Types
// ============================================

export type DueType = 'PRINCIPAL' | 'INTEREST' | 'PAST_DUE_INTEREST' | 'ATTORNEY_FEE' | 'COURT_FEE' | 'EXECUTION_FEE' | 'OTHER';

export interface DueDTO {
  id: string;
  caseId: string;
  type: DueType;
  description?: string;
  amount: number;
  dueDate: string;
  currency: string;
  interestType?: string;
  interestRate?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  interestDays?: number;
  sourceDocumentId?: string;
  sourceDocumentNo?: string;
  hasKdv: boolean;
  kdvRate?: number;
  hasBsmv: boolean;
  hasKkdf: boolean;
  requiresFinalization: boolean;
  isFinalized: boolean;
  finalizationDate?: string;
  finalizationNote?: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDueDTO {
  type: DueType;
  description?: string;
  amount: number;
  dueDate: string;
  currency?: string;
  interestType?: string;
  interestRate?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  sourceDocumentNo?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  isPrimary?: boolean;
}

export interface UpdateDueDTO {
  type?: DueType;
  description?: string;
  amount?: number;
  dueDate?: string;
  currency?: string;
  interestType?: string;
  interestRate?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  sourceDocumentNo?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  isFinalized?: boolean;
  finalizationDate?: string;
  finalizationNote?: string;
  sortOrder?: number;
  isPrimary?: boolean;
}

export const DueTypeLabels: Record<DueType, string> = {
  PRINCIPAL: 'Asıl Alacak',
  INTEREST: 'İşlemiş Faiz',
  PAST_DUE_INTEREST: 'Geçmiş Gün Faizi',
  ATTORNEY_FEE: 'Vekalet Ücreti',
  COURT_FEE: 'Yargılama Gideri',
  EXECUTION_FEE: 'İcra Masrafı',
  OTHER: 'Diğer',
};

// ============================================
// Collection (Tahsilat) Types
// ============================================

export type CollectionType = 'PRINCIPAL' | 'INTEREST' | 'EXPENSE' | 'FEE' | 'PARTIAL' | 'FULL' | 'OTHER';
export type CollectionChannel = 'NAKIT' | 'BANKA' | 'CEK' | 'SENET' | 'KREDI_KARTI' | 'ICRA_DAIRESI' | 'HACIZ' | 'DIGER';
export type CollectionStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type CollectionDispositionStatus = 'HELD_PENDING_DISTRIBUTION' | 'POSTED' | 'CANCELLED' | 'REVERSED';

export interface CollectionDTO {
  id: string;
  tenantId: string;
  caseId: string;
  caseDebtorId?: string;
  amount: number;
  currency: string;
  type: CollectionType;
  channel: CollectionChannel;
  date: string;
  valueDate?: string;
  description?: string;
  receiptNo?: string;
  bankName?: string;
  accountNo?: string;
  notes?: string;
  status: CollectionStatus;
  cancelledAt?: string;
  cancelReason?: string;
  accountingDispositionStatus?: CollectionDispositionStatus;
  accountingPostedAt?: string;
  manualReversalRequiredAt?: string;
  manualReversalReason?: string;
  createdAt: string;
  updatedAt: string;
  debtor?: { id: string; name: string };
}

export type CollectionDispositionLineType =
  | 'CLIENT_PAYABLE'
  | 'CONTRACTUAL_FEE_WITHHELD'
  | 'FIRM_EXPENSE_REIMBURSEMENT'
  | 'CLIENT_EXPENSE_REIMBURSEMENT'
  | 'OFFSET_CLIENT_ADVANCE'
  | 'HELD_PENDING_DISTRIBUTION'
  | 'OTHER';

export interface CollectionDispositionLineDTO {
  id: string;
  dispositionId: string;
  type: CollectionDispositionLineType | string;
  amount: string | number;
  caseClientId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface CollectionDispositionDTO {
  id: string;
  tenantId: string;
  caseId: string;
  collectionId: string;
  beneficiaryScope: string;
  caseClientId?: string | null;
  status: CollectionDispositionStatus;
  totalAmount: string | number;
  currency: string;
  sourcePaymentEventId?: string | null;
  createdById?: string | null;
  postedAt?: string | null;
  postedById?: string | null;
  manualReversalRequiredAt?: string | null;
  manualReversalReason?: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: CollectionDispositionLineDTO[];
}

export interface CreateCollectionDTO {
  caseDebtorId?: string;
  amount: number;
  currency?: string;
  type: CollectionType;
  channel: CollectionChannel;
  date: string;
  valueDate?: string;
  description?: string;
  receiptNo?: string;
  bankName?: string;
  accountNo?: string;
  notes?: string;
}

export interface UpdateCollectionDTO {
  amount?: number;
  type?: CollectionType;
  channel?: CollectionChannel;
  date?: string;
  valueDate?: string;
  description?: string;
  receiptNo?: string;
  bankName?: string;
  notes?: string;
  status?: CollectionStatus;
}

export const CollectionTypeLabels: Record<CollectionType, string> = {
  PRINCIPAL: 'Anapara',
  INTEREST: 'Faiz',
  EXPENSE: 'Masraf',
  FEE: 'Ücret',
  PARTIAL: 'Kısmi Ödeme',
  FULL: 'Tam Ödeme',
  OTHER: 'Diğer',
};

export const CollectionChannelLabels: Record<CollectionChannel, string> = {
  NAKIT: 'Nakit',
  BANKA: 'Banka Havalesi',
  CEK: 'Çek',
  SENET: 'Senet',
  KREDI_KARTI: 'Kredi Kartı',
  ICRA_DAIRESI: 'İcra Dairesinden',
  HACIZ: 'Haciz Yoluyla',
  DIGER: 'Diğer',
};

export const CollectionStatusLabels: Record<CollectionStatus, string> = {
  PENDING: 'Beklemede',
  CONFIRMED: 'Onaylandı',
  CANCELLED: 'İptal Edildi',
};

// ============================================
// Finance Summary Types
// ============================================

export interface CaseFinanceSummaryDTO {
  caseId: string;
  currency: string;
  totalDues: number;
  totalCollections: number;
  balance: number;
  duesByType: Array<{ type: DueType; amount: number; count: number }>;
  collectionsByChannel: Array<{ channel: CollectionChannel; amount: number; count: number }>;
}
