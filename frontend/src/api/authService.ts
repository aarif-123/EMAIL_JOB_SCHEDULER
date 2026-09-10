import { api } from './client';
import type { User } from '../types';

export interface AuthResponse {
  user: User;
  token: string;
}

export const authService = {
  devLogin(email: string, name: string): Promise<AuthResponse> {
    return api.post<AuthResponse>('/auth/dev-login', { email, name }).then((r) => r.data);
  },

  getGoogleAuthUrl(): Promise<{ url: string }> {
    return api.get<{ url: string }>('/auth/google/url').then((r) => r.data);
  },

  googleLogin(credential: string): Promise<AuthResponse> {
    return api.post<AuthResponse>('/auth/google', { credential }).then((r) => r.data);
  },

  getMe(): Promise<User> {
    return api.get<User>('/auth/me').then((r) => r.data);
  },
};
