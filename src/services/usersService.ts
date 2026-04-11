import { ApiClient } from './apiClient';
import type { User } from '../types';

export class UsersService {
  static async getUsers(): Promise<User[]> {
    return ApiClient.request('/users');
  }

  static async saveUser(user: Partial<User>): Promise<User> {
    const isNew = !user.id;
    return ApiClient.request(isNew ? '/users' : `/users/${user.id}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(user)
    });
  }

  static async deleteUser(id: string): Promise<void> {
    return ApiClient.request(`/users/${id}`, {
      method: 'DELETE'
    });
  }
}
