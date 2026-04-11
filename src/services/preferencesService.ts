import { ApiClient } from './apiClient';

export class PreferencesService {
  static async getPreferences() {
    try {
      return await ApiClient.request('/config/preferences');
    } catch (e) {
      console.error('Failed to load preferences', e);
      return {};
    }
  }

  static async savePreference(key: string, value: any) {
    try {
      return await ApiClient.request('/config/preferences', {
        method: 'POST',
        body: JSON.stringify({ key, value })
      });
    } catch (e) {
      console.error('Failed to save preference', e);
    }
  }
}
