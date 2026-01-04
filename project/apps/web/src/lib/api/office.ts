/**
 * Office API - Büro ayarları
 */

import { apiClient } from "./client";

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

// İİK 78 ayarlarını getir
export async function getIik78Settings(): Promise<Iik78Settings> {
  const { data } = await apiClient.get<Iik78Settings>("/office/iik78-settings");
  return data;
}

// İİK 78 ayarlarını güncelle
export async function updateIik78Settings(settings: Partial<Iik78Settings>): Promise<Iik78Settings> {
  const { data } = await apiClient.put<Iik78Settings>("/office/iik78-settings", settings);
  return data;
}

// Büro bilgilerini getir
export async function getOffice(): Promise<OfficeInfo> {
  const { data } = await apiClient.get<OfficeInfo>("/office");
  return data;
}
