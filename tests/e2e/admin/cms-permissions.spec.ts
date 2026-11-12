import { randomUUID } from 'node:crypto';
import { collections, connectContentDb } from '@greenscape/content';
import { expect, test } from '@playwright/test';
import { ADMIN, WEB, signIn } from '../helpers';
import { call, cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';

// CMS editing is for content staff only; drafts stay private until published; publishing reaches the public site.
// Uses a disposable project document (slug carries the run tag) that is removed afterwards.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');
const tag = `cmsauth-${randomUUID().slice(0, 6)}`;
const body = (title: string) => ({ title, category: 'residential-garden', location: 'Puerto Princesa', excerpt: 'Auth test project.', images: [{ url: 'https://example.com/auth-test.jpg', alt: 'Test garden' }], isFeatured: false });

test.afterAll(async () => {
  await cleanupEmployees('cmsauth');
  const { client, db } = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
  await db.collection(collections.projects).deleteMany({ slug: tag });
  await db.collection(collections.pageRevisions).deleteMany({ docId: { $regex: tag } });
  await client.close();
});

test('guests, customers and employees cannot read or change CMS content; content managers can; drafts stay private until published', async () => {
  const [customer, employee, editor] = await Promise.all([userWithRoles('cmscust', []), employeeUser('cmsauth'), userWithRoles('cmseditor', ['content_manager'])]);
  for (const [who, token, status] of [['guest', undefined, 401], ['customer', customer.token, 403], ['employee', employee.token, 403]] as const) {
    expect((await call('/v1/cms-admin/projects', token)).status, `${who} lists`).toBe(status);
    expect((await call('/v1/cms-admin/projects', token, { method: 'POST', body: JSON.stringify({ slug: tag, body: body('Nope') }) })).status, `${who} creates`).toBe(status);
    expect((await call(`/v1/cms-admin/projects/${tag}/publish`, token, { method: 'POST', body: '{}' })).status, `${who} publishes`).toBe(status);
  }

  expect((await call('/v1/cms-admin/projects', editor.token, { method: 'POST', body: JSON.stringify({ slug: tag, body: body('Draft title') }) })).status).toBe(201);
  expect((await call(`/v1/cms/projects/${tag}`)).status).toBe(404); // a draft is not public
  expect((await call(`/v1/cms-admin/projects/${tag}/publish`, editor.token, { method: 'POST', body: '{}' })).status).toBe(200);
  const live = await call(`/v1/cms/projects/${tag}`);
  expect(live.status).toBe(200);
  expect((await live.json()).title).toBe('Draft title');

  const doc = await (await call(`/v1/cms-admin/projects/${tag}`, editor.token)).json();
  expect((await call(`/v1/cms-admin/projects/${tag}`, editor.token, { method: 'PUT', body: JSON.stringify({ body: body('Unpublished edit'), revision: doc.revision }) })).status).toBe(200);
  expect((await (await call(`/v1/cms/projects/${tag}`)).json()).title).toBe('Draft title'); // the edit stays private
  const page = await fetch(`${WEB}/projects/${tag}`);
  expect(await page.text()).not.toContain('Unpublished edit');
});

test('in the admin, a content manager reaches the CMS and an employee does not', async ({ browser }) => {
  for (const [who, roles, sees] of [['editor', ['content_manager'], true], ['employee', ['employee'], false]] as const) {
    const u = await userWithRoles(`cmsui-${who}`, [...roles]);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${ADMIN}/login?next=%2Fcms%2Fprojects`);
    await signIn(page, u.email);
    if (sees) await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    else await expect(page.getByTestId('no-access')).toBeVisible();
    await ctx.close();
  }
});
