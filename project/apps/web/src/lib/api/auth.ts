/**
 * Auth API - Authentication endpoints
 */

import { apiClient } from './client';

export const authApi = {
  async login(email: string, password: string) {
    const data = await apiClient.request<{ token: string; user: any; tenant: any }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );
    apiClient.setToken(data.token);
    return data;
  },

  async register(data: {
    firmName: string;
    name: string;
    email: string;
    password: string;
  }) {
    const result = await apiClient.request<{ token: string; user: any; tenant: any }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    apiClient.setToken(result.token);
    return result;
  },

  async me() {
    return apiClient.request<{ user: any }>("/auth/me");
  },

  logout() {
    apiClient.clearToken();
  },
};
