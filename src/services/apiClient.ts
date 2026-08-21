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
        if (response.status === 401) {
             StorageService.clear();
             window.location.href = '/login?expired=true';
             throw new Error('AUTH_EXPIRED');
        }
        const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(error.error || 'Error en la petición');
    }

    if (response.status === 204) return null;
    return response.json();
  }

  /**
   * Descarga un fichero y devuelve su blob. Existe para que las pantallas no tengan que hacer su
   * propio `fetch` solo porque la respuesta no es JSON: pone el token igual que el resto y
   * traduce el error del servidor, venga en JSON o en texto plano.
   */
  static async download(endpoint: string): Promise<Blob> {
    const token = StorageService.getToken();
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    });

    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || 'Error al descargar el archivo');
      }
      const text = await response.text().catch(() => '');
      throw new Error(text || `Error ${response.status} al descargar el archivo`);
    }
    return response.blob();
  }

}
