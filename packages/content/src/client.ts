import { MongoClient, type Db } from 'mongodb';

/** Collection names in one place so indexes, cache tags and API stay in sync. */
export const collections = {
  pages: 'pages',
  pageRevisions: 'pageRevisions',
  blocks: 'blocks',
  templates: 'templates',
  navigation: 'navigation',
  siteConfig: 'siteConfig',
  services: 'services',
  projects: 'projects',
  galleryItems: 'galleryItems',
  articles: 'articles',
  testimonials: 'testimonials',
  faqs: 'faqs',
  productContent: 'productContent',
  /** Approved facts staff wrote for the AI assistant (title, body, enabled). */
  assistantKnowledge: 'assistantKnowledge',
} as const;
export type CollectionName = (typeof collections)[keyof typeof collections];

export async function connectContentDb(url: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000, appName: 'greenscape' });
  await client.connect();
  return { client, db: client.db(dbName) };
}

const publishable = ['pages', 'services', 'projects', 'articles'] as const;

/** Idempotent: safe to run on every deploy. */
export async function ensureIndexes(db: Db) {
  for (const c of publishable) {
    await db.collection(c).createIndex({ slug: 1, locale: 1 }, { unique: true });
    await db.collection(c).createIndex({ status: 1, publishAt: 1 }); // scheduled-publish worker
  }
  await db.collection('articles').createIndex({ status: 1, publishedAt: -1 });
  await db.collection('projects').createIndex({ 'published.category': 1, status: 1 });
  await db.collection('pageRevisions').createIndex({ collection: 1, docId: 1, revision: -1 }, { unique: true });
  await db.collection('blocks').createIndex({ key: 1, locale: 1 }, { unique: true });
  await db.collection('templates').createIndex({ key: 1 }, { unique: true });
  await db.collection('navigation').createIndex({ key: 1, locale: 1 }, { unique: true });
  await db.collection('siteConfig').createIndex({ locale: 1 }, { unique: true });
  await db.collection('testimonials').createIndex({ status: 1, createdAt: -1 });
  await db.collection('galleryItems').createIndex({ status: 1, category: 1, sortOrder: 1 });
  await db.collection('faqs').createIndex({ locale: 1, status: 1, sortOrder: 1 });
  await db.collection('productContent').createIndex({ productId: 1, locale: 1 }, { unique: true });
  await db.collection('assistantKnowledge').createIndex({ enabled: 1, updatedAt: -1 });
}
