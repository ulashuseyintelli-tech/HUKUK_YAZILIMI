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
   * Politika degerini getir
   */
  async getValidationPolicy(key: string) {
    return this.request<{ key: string; value: any }>(`/validation-gate/policy?key=${encodeURIComponent(key)}`);
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
}

// ============================================
// ValidationGate Types
// ============================================

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

export const api = new ApiClient();
