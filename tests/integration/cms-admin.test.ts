import { collections } from '@greenscape/content';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { startScheduler } from '../../apps/api/src/lib/publisher.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const SECRET = 'integration-preview-secret-123';
const tag = `it${Date.now()}`;
const slug = `test-project-${tag}`;
const img = { url: 'https://example.com/test.jpg', alt: 'Test garden' };
const body = (title: string) => ({ title, category: 'residential-garden', location: 'Puerto Princesa', excerpt: 'A test project.', images: [img], isFeatured: false });

let deps: Deps;
let app: ReturnType<typeof createApp>;
let editor = '';
let publisher = '';
let customer = '';
const authIds: string[] = [];
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

async function staff(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token));
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
  await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  return u.token;
}

beforeAll(async () => {
  deps = await testDeps({ PREVIEW_SECRET: SECRET, REVALIDATE_SECRET: '' });
  app = createApp(deps);
  editor = await staff('editor', ['content_manager']);
  publisher = editor; // content_manager has cms.publish
  customer = (await signedInUser(`cust-${tag}`)).token;
});
afterAll(async () => {
  await deps.mongo.db.collection(collections.projects).deleteMany({ slug: { $regex: tag } });
  await deps.mongo.db.collection(collections.pageRevisions).deleteMany({ docId: { $regex: tag } });
  await deps.mongo.db.collection(collections.galleryItems).deleteMany({ caption: { $regex: tag } });
  await deps.mongo.db.collection(collections.testimonials).deleteMany({ text: { $regex: tag } });
  const media = await deps.db.mediaAsset.findMany({ where: { bucket: 'public-media', alt: { contains: tag } } });
  await deps.storage.remove('public-media', media.map((m) => m.path)).catch(() => {});
  await deps.db.mediaAsset.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('editing and publishing', () => {
  it('customers cannot use the CMS', async () => {
    await request(app).get('/v1/cms-admin/projects').set(as(customer)).expect(403);
  });

  it('validates drafts against the content schema with field paths', async () => {
    const res = await request(app).post('/v1/cms-admin/projects').set(as(editor)).send({ slug, body: { ...body('X'), category: 'spaceship', images: [] } }).expect(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['category', 'images']));
  });

  it('drafts stay private until published; publishing replaces the cached public version', async () => {
    await request(app).post('/v1/cms-admin/projects').set(as(editor)).send({ slug, body: body('First title') }).expect(201);
    await request(app).get(`/v1/cms/projects/${slug}`).expect(404);

    await request(app).post(`/v1/cms-admin/projects/${slug}/publish`).set(as(publisher)).send({}).expect(200);
    expect((await request(app).get(`/v1/cms/projects/${slug}`).expect(200)).body.title).toBe('First title'); // now cached

    const doc = await request(app).get(`/v1/cms-admin/projects/${slug}`).set(as(editor)).expect(200);
    await request(app).put(`/v1/cms-admin/projects/${slug}`).set(as(editor)).send({ body: body('Second title'), revision: doc.body.revision }).expect(200);
    expect((await request(app).get(`/v1/cms/projects/${slug}`).expect(200)).body.title).toBe('First title'); // draft not live yet

    const list = await request(app).get('/v1/cms-admin/projects').set(as(editor)).expect(200);
    expect(list.body.find((d: { slug: string }) => d.slug === slug).hasUnpublishedChanges).toBe(true);

    await request(app).post(`/v1/cms-admin/projects/${slug}/publish`).set(as(publisher)).send({}).expect(200);
    expect((await request(app).get(`/v1/cms/projects/${slug}`).expect(200)).body.title).toBe('Second title'); // cache invalidated
  });

  it('rejects saves based on an old revision (no silent overwrite)', async () => {
    const res = await request(app).put(`/v1/cms-admin/projects/${slug}`).set(as(editor)).send({ body: body('Stale'), revision: 1 }).expect(409);
    expect(res.body.error.message).toMatch(/Someone else saved/);
  });

  it('keeps revisions and restores one into the draft', async () => {
    const revs = await request(app).get(`/v1/cms-admin/projects/${slug}/revisions`).set(as(editor)).expect(200);
    expect(revs.body.length).toBeGreaterThanOrEqual(4);
    const created = revs.body.find((r: { note: string }) => r.note === 'created');
    const restored = await request(app).post(`/v1/cms-admin/projects/${slug}/rollback`).set(as(editor)).send({ revision: created.revision }).expect(200);
    expect(restored.body.draft.title).toBe('First title');
  });

  it('preview shows the draft only with the server secret', async () => {
    expect((await request(app).get(`/v1/cms/projects/${slug}`).set('x-preview-secret', SECRET).expect(200)).body).toMatchObject({ title: 'First title', preview: true });
    expect((await request(app).get(`/v1/cms/projects/${slug}`).set('x-preview-secret', 'wrong-secret-value-123').expect(200)).body.title).toBe('Second title');
  });

  it('schedules a publish that the worker applies when due', async () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await request(app).post(`/v1/cms-admin/projects/${slug}/publish`).set(as(publisher)).send({ at }).expect(200);
    expect(res.body.publishAt).toBe(at);
    expect((await request(app).get(`/v1/cms/projects/${slug}`).expect(200)).body.title).toBe('Second title'); // live version unchanged

    await deps.mongo.db.collection(collections.projects).updateOne({ slug }, { $set: { publishAt: new Date(Date.now() - 1000) } });
    const sched = startScheduler(deps, 3_600_000);
    await sched.tick();
    sched.stop();
    expect((await request(app).get(`/v1/cms/projects/${slug}`).expect(200)).body.title).toBe('First title');
  });

  it('exports and re-imports JSON', async () => {
    const exp = await request(app).get(`/v1/cms-admin/projects/${slug}/export`).set(as(editor)).expect(200);
    expect(exp.body).toMatchObject({ format: 'greenscape-cms/1', type: 'projects', slug });
    const copy = { ...exp.body, slug: `${slug}-copy`, body: { ...exp.body.body, title: 'Imported copy' } };
    await request(app).post('/v1/cms-admin/projects/import').set(as(editor)).send(copy).expect(200);
    expect((await request(app).get(`/v1/cms-admin/projects/${slug}-copy`).set(as(editor)).expect(200)).body.draft.title).toBe('Imported copy');
    await request(app).post('/v1/cms-admin/pages/import').set(as(editor)).send(copy).expect(400);
  });

  it('unpublish takes it offline; archive hides it from the default list', async () => {
    await request(app).post(`/v1/cms-admin/projects/${slug}/unpublish`).set(as(publisher)).send({}).expect(200);
    await request(app).get(`/v1/cms/projects/${slug}`).expect(404);
    await request(app).post(`/v1/cms-admin/projects/${slug}/archive`).set(as(publisher)).send({}).expect(200);
    const list = await request(app).get('/v1/cms-admin/projects').set(as(editor)).expect(200);
    expect(list.body.map((d: { slug: string }) => d.slug)).not.toContain(slug);
  });
});

describe('collections and moderation', () => {
  it('moderates testimonials', async () => {
    const { insertedId } = await deps.mongo.db.collection(collections.testimonials).insertOne({ name: 'Test T.', rating: 5, text: `Lovely work ${tag}`, status: 'pending', createdAt: new Date() });
    const id = String(insertedId);
    await request(app).patch(`/v1/cms-admin/collections/testimonials/${id}`).set(as(customer)).send({ status: 'approved' }).expect(403);
    await request(app).patch(`/v1/cms-admin/collections/testimonials/${id}`).set(as(editor)).send({ status: 'approved' }).expect(200);
    expect((await request(app).get('/v1/cms/testimonials?limit=100')).body.map((t: { text: string }) => t.text)).toContain(`Lovely work ${tag}`);
    await request(app).patch(`/v1/cms-admin/collections/testimonials/${id}`).set(as(editor)).send({ status: 'rejected' }).expect(200);
    expect((await request(app).get('/v1/cms/testimonials?limit=100')).body.map((t: { text: string }) => t.text)).not.toContain(`Lovely work ${tag}`);
  });

  it('adds and removes gallery items, live immediately', async () => {
    const created = await request(app).post('/v1/cms-admin/collections/galleryItems').set(as(editor)).send({ image: img, caption: `Pool ${tag}`, sortOrder: 999, status: 'published' }).expect(201);
    expect((await request(app).get('/v1/cms/gallery?limit=100')).body.map((g: { caption?: string }) => g.caption)).toContain(`Pool ${tag}`);
    await request(app).delete(`/v1/cms-admin/collections/galleryItems/${created.body.id}`).set(as(editor)).expect(204);
    expect((await request(app).get('/v1/cms/gallery?limit=100')).body.map((g: { caption?: string }) => g.caption)).not.toContain(`Pool ${tag}`);
  });
});

describe('media library', () => {
  async function upload(bytes: Buffer, contentType = 'image/png') {
    const slot = await request(app).post('/v1/media/uploads').set(as(editor)).send({ filename: 'a.png', contentType, size: bytes.length }).expect(201);
    const put = await fetch(slot.body.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: new Uint8Array(bytes) });
    expect(put.ok).toBe(true);
    return slot.body.id as string;
  }

  it('records dimensions and a blur placeholder; refuses a mislabelled file', async () => {
    const id = await upload(PNG);
    const done = await request(app).post(`/v1/media/uploads/${id}/complete`).set(as(editor)).send({ alt: `Tiny ${tag}` }).expect(200);
    expect(done.body).toMatchObject({ width: 1, height: 1, alt: `Tiny ${tag}` });
    expect(done.body.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect((await fetch(done.body.url)).status).toBe(200);

    const bad = await upload(Buffer.from('not an image at all'), 'image/png');
    await request(app).post(`/v1/media/uploads/${bad}/complete`).set(as(editor)).send({}).expect(400);
    expect(await deps.db.mediaAsset.findUnique({ where: { id: bad } })).toBeNull();

    // PNG signature but corrupt data: 400, not 500, and nothing left behind.
    const corrupt = await upload(Buffer.concat([PNG.subarray(0, 40), Buffer.alloc(20)]));
    const res = await request(app).post(`/v1/media/uploads/${corrupt}/complete`).set(as(editor)).send({}).expect(400);
    expect(res.body.error.message).toMatch(/could not be read/);
    expect(await deps.db.mediaAsset.findUnique({ where: { id: corrupt } })).toBeNull();
  });

  it('will not delete an image that content still uses', async () => {
    const id = await upload(PNG);
    const done = await request(app).post(`/v1/media/uploads/${id}/complete`).set(as(editor)).send({ alt: `Used ${tag}` }).expect(200);
    await request(app).post('/v1/cms-admin/collections/galleryItems').set(as(editor)).send({ image: { url: done.body.url, alt: 'x' }, caption: `Uses ${tag}`, sortOrder: 998, status: 'hidden' }).expect(201);
    const res = await request(app).delete(`/v1/media/${id}`).set(as(editor)).expect(409);
    expect(res.body.error.details.usedBy[0]).toMatch(/^galleryItems\//);
    await deps.mongo.db.collection(collections.galleryItems).deleteMany({ caption: `Uses ${tag}` });
    await request(app).delete(`/v1/media/${id}`).set(as(editor)).expect(204);
  });
});
