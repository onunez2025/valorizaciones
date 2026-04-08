import { StorageService } from './storageService';

export const API_BASE_URL = '/api';

export class ApiClient {
  static async request(endpoint: string, options: RequestInit = {}) {
    const token = StorageService.getToken();
    const isFormData = options.body instanceof FormData;
    
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(error.error || 'Error en la petición');
    }

    if (response.status === 204) return null;
    return response.json();
  }
}
