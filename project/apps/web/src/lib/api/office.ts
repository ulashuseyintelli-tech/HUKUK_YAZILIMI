/**
 * Office API - Büro ayarları
 */

import { apiClient } from "./client";

/**
 * İİK 78 büro ayarı — YALNIZ SAKLANIR (F03-D2, owner kararı K6-b, 25.11.2026): değerler hiçbir hesapta tüketilmez; dosya
 * pasiflik göstergesi yasal 1 yılla hesaplanır (`lib/iik78-inactivity.ts`) ve bu ayarla değişmez.
 */
export interface Iik78Settings {
  inactivityThresholdDays: number;
  inactivityWarningDays: number;
}

export interface OfficeInfo {
  id: string;
  name: string;
  address?: string;
  city?: string;
  district?: string;
  phone?: string;
  email?: string;
  inactivityThresholdDays?: number;
  inactivityWarningDays?: number;
}

// İİK 78 ayarlarını getir (yalnız saklanan değer; hesapta tüketilmez)
export async function getIik78Settings(): Promise<Iik78Settings> {
  const { data } = await apiClient.get<Iik78Settings>("/office/iik78-settings");
  return data;
}

// İİK 78 ayarlarını güncelle (yalnız saklanan değer; pasiflik hesabını değiştirmez)
export async function updateIik78Settings(settings: Partial<Iik78Settings>): Promise<Iik78Settings> {
  const { data } = await apiClient.put<Iik78Settings>("/office/iik78-settings", settings);
  return data;
}

// Büro bilgilerini getir
export async function getOffice(): Promise<OfficeInfo> {
  const { data } = await apiClient.get<OfficeInfo>("/office");
  return data;
}
