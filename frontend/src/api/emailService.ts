import { api } from './client';
import type { ScheduledEmail } from '../types';

export interface ScheduleEmailPayload {
  senderEmail: string;
  rotateSenders: boolean;
  recipients: string[];
  subject: string;
  body: string;
  delayBetweenSeconds: number;
  hourlyLimit: number;
  startTime: string | null;
}

export interface EmailListResponse {
  emails: ScheduledEmail[];
  total?: number;
}

export interface SearchEmailsResponse {
  emails: ScheduledEmail[];
  total: number;
}

export interface ParseLeadsResponse {
  emails: string[];
  detectedCount: number;
}

export const emailService = {
  getScheduled(): Promise<EmailListResponse> {
    return api.get<EmailListResponse>('/emails/scheduled').then((r) => r.data);
  },

  getSent(): Promise<EmailListResponse> {
    return api.get<EmailListResponse>('/emails/sent').then((r) => r.data);
  },

  search(q: string, status: string): Promise<SearchEmailsResponse> {
    return api
      .get<SearchEmailsResponse>(`/emails/search?q=${encodeURIComponent(q)}&status=${status}`)
      .then((r) => r.data);
  },

  getById(id: string): Promise<ScheduledEmail> {
    return api.get<ScheduledEmail>(`/emails/${id}`).then((r) => r.data);
  },

  schedule(payload: ScheduleEmailPayload): Promise<{ message: string }> {
    return api.post<{ message: string }>('/emails/schedule', payload).then((r) => r.data);
  },

  parseLeads(file: File): Promise<ParseLeadsResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<ParseLeadsResponse>('/emails/parse-leads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  getSenders(): Promise<import('../types').SenderAccount[]> {
    return api.get<import('../types').SenderAccount[]>('/emails/senders').then((r) => r.data);
  },

  addSender(data: { email: string; name: string }): Promise<import('../types').SenderAccount> {
    return api.post<import('../types').SenderAccount>('/emails/senders', data).then((r) => r.data);
  },

  getStats(): Promise<import('../types').EmailStats> {
    return api.get<import('../types').EmailStats>('/emails/stats').then((r) => r.data);
  },
};
