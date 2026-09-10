import { Client } from '@elastic/elasticsearch';
import { env } from './env';

export const esClient = new Client({
  node: env.ELASTICSEARCH_NODE,
});

export const EMAIL_INDEX_NAME = 'reachinbox_emails';

export async function initElasticsearchIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: EMAIL_INDEX_NAME });
    if (!exists) {
      await esClient.indices.create({
        index: EMAIL_INDEX_NAME,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            batchId: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            recipientEmail: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } },
            },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            etherealPreviewUrl: { type: 'keyword' },
            createdAt: { type: 'date' },
          },
        },
      });
      console.log(`✅ Elasticsearch index '${EMAIL_INDEX_NAME}' created`);
    } else {
      console.log(`ℹ️ Elasticsearch index '${EMAIL_INDEX_NAME}' already exists`);
    }
  } catch (error: any) {
    console.error('⚠️ Elasticsearch init warning (search may degrade if unavailable):', error?.message || error);
  }
}
