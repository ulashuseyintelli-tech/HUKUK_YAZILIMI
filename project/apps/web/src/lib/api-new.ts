/**
 * API Module - Re-export from modular structure
 * 
 * Bu dosya geriye uyumluluk için eski api.ts yerine geçer.
 * Yeni kod için doğrudan ./api/ klasöründeki modülleri kullanın.
 * 
 * Örnek:
 *   import { casesApi } from '@/lib/api/cases';
 *   import { authApi } from '@/lib/api/auth';
 */

// Re-export everything from modular API
export * from './api';
export { api as default } from './api';
