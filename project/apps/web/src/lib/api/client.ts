/**
 * API Client - Base HTTP client with authentication
 */
import { reportClientError, shouldReportNetworkError } from "../error-reporter"; // PR-4: yalnız network-failure
import { buildApiHttpError, readErrorBody } from "../api-error"; // OWN-12 ADIM A: kanonik hata sozlesmesi
import { api } from "../api"; // CAD-C1-B03-AUTH-CONTINUITY-REMEDIATION-R01: OFFICE-AUTH-P01 kanonik token kaynağı (tek-kaynak)

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Debug: Log API URL on client side
if (typeof window !== "undefined") {
  console.log("[API] Base URL:", API_URL);
}

export class ApiClient {
  // CAD-C1-B03-AUTH-CONTINUITY-REMEDIATION-R01: token durumu TEK-KAYNAK olarak lib/api.ts'in `api`
  // singleton'ında tutulur (OFFICE-AUTH-P01: getToken = this.token ?? sessionStorage ?? localStorage).
  // Bu client kendi localStorage-only deposunu KULLANMAZ; aksi halde "Beni hatırla" KAPALIYKEN token
  // yalnız sessionStorage'da olur, bu client bulamaz ve tüm çağrılar 401 döner (compliance yüzeyleri dahil).
  setToken(token: string) {
    api.setToken(token);
  }

  getToken(): string | null {
    return api.getToken();
  }

  clearToken() {
    api.clearToken();
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(`${API_URL}/api${endpoint}`, {
        ...options,
        headers,
      });
    } catch (err: any) {
      // PR-4: yalnız gerçek ağ hatası raporlanır (HTTP response DEĞİL → backend loglar; /error-logs/log self-skip).
      if (shouldReportNetworkError(err, endpoint)) {
        reportClientError({
          level: "ERROR",
          message: `Network error: ${err?.message ?? "fetch failed"}`,
          stack: err?.stack,
          endpoint: `web:apiClient ${endpoint}`,
          metadata: { safeErrorCode: "NETWORK_ERROR" },
        });
      }
      throw err;
    }

    if (!response.ok) {
      // P3-2B: 4xx/5xx hata GÖVDESİNİ KORU (.message + .body + .status). NOT: structured-200
      // Guarded-Edge zarfı buraya GİRMEZ (response.ok=true → json döner, detektör ele alır).
      // OWN-12 ADIM A: hata kurma KANONIK yardimcida (lib/api-error.ts); davranis AYNI.
      throw buildApiHttpError(await readErrorBody(response), response.status);
    }

    return response.json();
  }

  async requestBlob(endpoint: string, options: RequestInit = {}): Promise<Blob> {
    const token = this.getToken();
    const headers: HeadersInit = {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // P3-2B: hata gövdesini KORU (request() ile aynı) — OWN-12 ADIM A: kanonik yardimci.
      throw buildApiHttpError(await readErrorBody(response), response.status);
    }

    return response.blob();
  }

  // Generic HTTP methods
  async get<T = any>(endpoint: string, options?: { responseType?: "json" | "blob" }): Promise<{ data: T }> {
    if (options?.responseType === "blob") {
      const blob = await this.requestBlob(endpoint);
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

  async put<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  async patch<T = any>(endpoint: string, body?: any): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  }

  async delete<T = any>(endpoint: string): Promise<{ data: T }> {
    const data = await this.request<T>(endpoint, { method: "DELETE" });
    return { data };
  }
}

// Singleton instance
export const apiClient = new ApiClient();
