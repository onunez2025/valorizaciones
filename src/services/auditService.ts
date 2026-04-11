import { ApiClient } from './apiClient';

export class AuditService {
  static async getLogs() {
    return ApiClient.request('/config/audit-logs');
  }
}
