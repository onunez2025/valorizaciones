import { ApiClient } from './apiClient';
import type { Role, Permission } from '../types';

export class RolesService {
  static async getRoles(): Promise<Role[]> {
    return ApiClient.request('/roles');
  }

  static async saveRole(role: Role): Promise<Role> {
    const isNew = !role.id;
    return ApiClient.request(isNew ? '/roles' : `/roles/${role.id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(role)
    });
  }

  static async deleteRole(id: string): Promise<void> {
    return ApiClient.request(`/roles/${id}`, {
      method: 'DELETE'
    });
  }

  static getAllPermissions(): { id: Permission; label: string; group: string }[] {
    return [
      // Dashboard
      { id: 'val.dashboard.view' as Permission, label: 'Ver Dashboard', group: 'Dashboard' },

      // Valorizaciones CAS
      { id: 'val.valuations.view' as Permission, label: 'Ver Módulo', group: 'Valorizaciones CAS' },
      { id: 'val.valuations.export' as Permission, label: 'Exportar a Excel', group: 'Valorizaciones CAS' },
      { id: 'val.valuations.close' as Permission, label: 'Cerrar Quincena', group: 'Valorizaciones CAS' },

      // Tarifario
      { id: 'val.tarifario.view' as Permission, label: 'Ver Módulo', group: 'Tarifario de Servicios' },
      { id: 'val.tarifario.add' as Permission, label: 'Añadir Nueva Tarifa', group: 'Tarifario de Servicios' },

      // Configuración
      { id: 'val.config.users' as Permission, label: 'Gestión de Usuarios', group: 'Configuración' },
      { id: 'val.config.roles' as Permission, label: 'Gestión de Roles', group: 'Configuración' },
      { id: 'val.config.audit' as Permission, label: 'Ver Auditoría', group: 'Configuración' }
    ];
  }
}
