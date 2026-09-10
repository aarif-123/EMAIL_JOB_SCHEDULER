import { esClient, EMAIL_INDEX_NAME } from '../config/elasticsearch';

export interface IndexedEmailDoc {
  id: string;
  userId: string;
  batchId?: string | null;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date | string;
  sentAt?: Date | string | null;
  etherealPreviewUrl?: string | null;
  createdAt: Date | string;
}

export class ElasticService {
  /**
   * Index or update an email document in Elasticsearch
   */
  static async indexEmail(doc: IndexedEmailDoc): Promise<void> {
    try {
      await esClient.index({
        index: EMAIL_INDEX_NAME,
        id: doc.id,
        refresh: true,
        document: {
          ...doc,
          scheduledAt: new Date(doc.scheduledAt).toISOString(),
          sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
          createdAt: new Date(doc.createdAt).toISOString(),
        },
      });
    } catch (err: any) {
      console.warn('⚠️ Elasticsearch indexing error (non-fatal):', err?.message || err);
    }
  }

  /**
   * Update status and attributes of an existing email document
   */
  static async updateEmailStatus(
    id: string,
    updates: Partial<IndexedEmailDoc>
  ): Promise<void> {
    try {
      const doc: Record<string, any> = { ...updates };
      if (updates.sentAt) doc.sentAt = new Date(updates.sentAt).toISOString();
      if (updates.scheduledAt) doc.scheduledAt = new Date(updates.scheduledAt).toISOString();

      await esClient.update({
        index: EMAIL_INDEX_NAME,
        id,
        doc,
        doc_as_upsert: true,
      });
    } catch (err: any) {
      console.warn(`⚠️ Elasticsearch update error for ${id} (non-fatal):`, err?.message || err);
    }
  }

  /**
   * Search emails in Elasticsearch with optional status and query filter
   */
  static async searchEmails(params: {
    userId: string;
    query?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; emails: any[] }> {
    try {
      const mustClauses: any[] = [{ term: { 'userId.keyword': params.userId } }];

      if (params.status) {
        mustClauses.push({ term: { 'status.keyword': params.status } });
      }

      if (params.query && params.query.trim().length > 0) {
        mustClauses.push({
          multi_match: {
            query: params.query.trim(),
            fields: ['subject^3', 'recipientEmail^2', 'body', 'senderEmail'],
            fuzziness: 'AUTO',
          },
        });
      }

      const response = await esClient.search({
        index: EMAIL_INDEX_NAME,
        from: params.offset || 0,
        size: params.limit || 50,
        sort: [{ scheduledAt: { order: 'desc' } }],
        query: {
          bool: {
            must: mustClauses,
          },
        },
      });

      const hits = response.hits.hits;
      const total = typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0;

      const emails = hits.map((hit: any) => ({
        ...hit._source,
        id: hit._id,
      }));

      return { total, emails };
    } catch (err: any) {
      console.warn('⚠️ Elasticsearch search query failed, falling back to DB:', err?.message || err);
      return { total: 0, emails: [] };
    }
  }
}
