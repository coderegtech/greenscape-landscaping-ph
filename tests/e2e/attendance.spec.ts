import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Browser } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB, email, signIn, signedInCustomer, staffUser } from './helpers';

const db = createPrismaClient(process.env.DATABASE_URL!);
const tag = `e2e${randomUUID().slice(0, 6)}`;
const manila = (offsetDays = 0) => new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const scheduleIds: string[] = [];

/** Split-shift schedule, every day of the week, so tests behave the same whatever day they run. */
async function schedule() {
  const s = await db.workSchedule.create({ data: { name: `E2E crew ${tag} ${randomUUID().slice(0, 4)}`, graceMinutes: 10, shifts: { create: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '12:00' }, { weekday, startTime: '13:00', endTime: '17:00' }]) } } });
  scheduleIds.push(s.id);
  return s;
}
/** An employee already linked to a signed-up account (HR's linking is covered in the staff test). */
async function linkedEmployee(label: string) {
  const u = await staffUser(label, ['employee']);
  const user = await db.user.findUniqueOrThrow({ where: { email: u.email } });
  const s = await schedule();
  const e = await db.employee.create({ data: { employeeNo: `E2E-${randomUUID().slice(0, 6).toUpperCase()}`, firstName: 'Ramon', lastName: `Reyes ${tag}`, email: u.email, userId: user.id, scheduleAssignments: { create: { scheduleId: s.id, effectiveFrom: new Date(`${manila(-60)}T00:00:00Z`) } } } });
  return { ...u, employee: e };
}
/** The employee portal in its own browser context (localhost apps share cookies: keep the people apart). */
async function portalSession(browser: Browser, address: string, password?: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, address, password);
  await expect(page).toHaveURL(password ? `${EMPLOYEE}/password` : `${EMPLOYEE}/`);
  return page;
}

test.afterAll(async () => {
  const emps = await db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  const ids = emps.map((e) => e.id);
  await db.attendanceRecord.deleteMany({ where: { employeeId: { in: ids } } });
  await db.leaveRequest.deleteMany({ where: { employeeId: { in: ids } } });
  await db.employee.deleteMany({ where: { id: { in: ids } } });
  await db.workSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
  await db.$disconnect();
});

test('employee clocks in from a phone or desktop; the page passes axe', async ({ browser }) => {
  const w = await linkedEmployee('clock');
  const page = await portalSession(browser, w.email);
  await expect(page.getByRole('heading', { name: 'Hello, Ramon' })).toBeVisible();
  await expect(page.getByTestId('clock-status')).toHaveText('You are not clocked in.');
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByTestId('clock-status')).toContainText('Clocked in since');
  await expect(page.getByRole('button', { name: 'Clock out' })).toBeVisible();
  await page.getByRole('button', { name: 'Clock out' }).click(); // less than a minute later
  await expect(page.getByText('You clocked in less than a minute ago.')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await page.context().close();
});

test('clocking in works before (or without) the page JavaScript', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'same form on both sizes');
  const w = await linkedEmployee('nojs');
  const signed = await portalSession(browser, w.email); // sign in with JS, then reuse the session without it
  const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await signed.context().storageState() });
  await signed.context().close();
  const page = await ctx.newPage();
  await page.goto(EMPLOYEE);
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByTestId('clock-status')).toContainText('Clocked in since');
  expect(await db.timePunch.count({ where: { record: { employeeId: w.employee.id } } })).toBe(1);
  await ctx.close();
});

test.describe('with HR', () => {
  test.skip(({ isMobile }) => isMobile, 'HR flows run on desktop');

  test('HR adds an employee, who clocks in; a missed day is corrected and approved; leave is approved', async ({ page, browser }) => {
    // HR signs in to the admin, adds the employee and creates their login (employees never self-register).
    const hr = await staffUser('hr', ['hr_manager']);
    const emp = { email: email('crew') };
    const s = await schedule();
    await page.goto(`${ADMIN}/login`);
    await signIn(page, hr.email);
    await expect(page.getByTestId('staff-identity')).toBeVisible();
    await page.goto(`${ADMIN}/employees/new`);
    await page.getByLabel('First name').filter({ visible: true }).fill('Liza');
    await page.getByLabel('Last name').filter({ visible: true }).fill(`Santos ${tag}`);
    await page.getByLabel('Employee number').filter({ visible: true }).fill(`E2E-${randomUUID().slice(0, 6).toUpperCase()}`);
    await page.getByLabel('Position').filter({ visible: true }).fill('Gardener');
    await page.getByLabel(/^Work email/).filter({ visible: true }).fill(emp.email);
    await page.getByRole('button', { name: 'Add employee' }).click();
    await page.getByRole('button', { name: 'Create login' }).click();
    const temporary = (await page.getByTestId('temporary-password').locator('code').textContent())!.trim();
    await page.getByRole('combobox', { name: 'Schedule' }).selectOption({ label: s.name });
    await page.getByLabel('From').fill(manila(-30));
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText(`${s.name}: from ${manila(-30)} onwards`)).toBeVisible();

    // First sign-in at the employee portal with the temporary password: they must choose their own first.
    const staff = await portalSession(browser, emp.email, temporary);
    await staff.getByLabel('New password', { exact: true }).fill('Liza-Santos-2026');
    await staff.getByLabel('Confirm new password').fill('Liza-Santos-2026');
    await staff.getByRole('button', { name: 'Save password' }).click();
    await expect(staff.getByRole('heading', { name: 'Hello, Liza' })).toBeVisible();
    // Then clocks in and asks for yesterday to be corrected.
    await staff.getByRole('button', { name: 'Clock in' }).click();
    await expect(staff.getByTestId('clock-status')).toContainText('Clocked in since');
    await staff.getByRole('button', { name: 'Ask for a correction', exact: true }).click(); // a per-day "Correct …" button also exists once a past day is on the list
    const dialog = staff.getByRole('dialog');
    await dialog.getByLabel('Day', { exact: true }).fill(manila(-1));
    await dialog.getByLabel('What happened').fill('Phone battery died, worked the full day at the resort site');
    await dialog.getByRole('button', { name: 'Send for approval' }).click();
    await expect(staff.getByText('Sent to your manager')).toBeVisible();

    // HR sees today's clock-in on the board, approves the correction, then approves the corrected day.
    await page.goto(`${ADMIN}/attendance`);
    await expect(page.getByRole('row', { name: /Liza Santos/ })).toContainText('Clocked in');
    await page.goto(`${ADMIN}/attendance/corrections`);
    const item = page.getByTestId('correction').filter({ hasText: 'Phone battery died' });
    await expect(item).toContainText('nothing recorded');
    await item.getByRole('button', { name: 'Approve' }).click();
    await expect(item).toHaveCount(0); // gone from the waiting queue
    await page.goto(`${ADMIN}/attendance?date=${manila(-1)}`);
    const row = page.getByRole('row', { name: /Liza Santos/ });
    await expect(row).toContainText('Present');
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^Approve/ }).click();
    await expect(row).toContainText('approved');

    // Leave: request at the portal, approve in the admin, the employee sees it.
    const day = manila(21);
    await staff.reload();
    await staff.getByRole('combobox', { name: /^Type/ }).selectOption({ label: 'Service incentive leave' });
    await staff.getByLabel('First day').fill(day);
    await staff.getByLabel('Half day').check();
    await staff.getByRole('button', { name: 'Send request' }).click();
    await expect(staff.getByText(/Leave requested: 0.5 day/)).toBeVisible();
    await page.goto(`${ADMIN}/leave`);
    const req = page.getByTestId('leave-request').filter({ hasText: 'Liza Santos' });
    await req.getByRole('button', { name: 'Approve' }).click();
    await expect(req).toHaveCount(0);
    await staff.reload();
    await expect(staff.getByRole('list', { name: 'Your requests' })).toContainText('Approved');
    await expect(staff.getByRole('list', { name: 'Balances' })).toContainText('4.5');
    await staff.context().close();
  });
});

test('the employee portal turns customers away, and the old /staff link goes there', async ({ page, browser }) => {
  await page.goto(`${WEB}/staff`);
  await expect(page).toHaveURL(new RegExp(`^${EMPLOYEE}/login`));
  const ctx = await browser.newContext();
  const customer = await ctx.newPage();
  await signedInCustomer(customer, 'portalcust');
  const u = (await db.user.findFirstOrThrow({ where: { email: { contains: 'portalcust' } }, orderBy: { createdAt: 'desc' } })).email;
  const portal = await ctx.newPage();
  await portal.goto(`${EMPLOYEE}/login`);
  await signIn(portal, u);
  await expect(portal.getByText('This portal is for Greenscape employees')).toBeVisible();
  await expect(portal.getByRole('button', { name: 'Clock in' })).toHaveCount(0);
  await ctx.close();
});

test('a selfie goes with the clock-in when HR turns selfies on; HR opens it; the month calendar shows the day', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'one pass is enough');
  test.setTimeout(150_000);
  // Optional (not required) so attendance tests running in parallel are not blocked by the global setting.
  await db.appSetting.upsert({ where: { key: 'attendance.selfie' }, create: { key: 'attendance.selfie', value: { mode: 'optional', retentionDays: 30 } }, update: { value: { mode: 'optional', retentionDays: 30 } } });
  try {
    const w = await linkedEmployee('selfie');
    const staff = await portalSession(browser, w.email);
    await expect(staff.getByTestId('selfie')).toContainText('deleted after 30 days');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
    await staff.getByTestId('selfie').locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
    await expect(staff.getByText('Photo ready.')).toBeVisible({ timeout: 20_000 });
    await staff.getByRole('button', { name: 'Clock in' }).click();
    await expect(staff.getByTestId('clock-status')).toContainText('Clocked in since');
    await expect.poll(async () => (await db.timePunch.findFirst({ where: { record: { employeeId: w.employee.id } } }))?.photoMediaId ?? null).not.toBeNull();
    await expect(staff.getByTestId('month-calendar')).toContainText('Clocked in');
    await staff.context().close();

    const hr = await staffUser('hrselfie', ['hr_manager']);
    await page.goto(`${ADMIN}/login?next=${encodeURIComponent(`/attendance/employee/${w.employee.id}`)}`);
    await signIn(page, hr.email);
    await expect(page.getByRole('link', { name: /^Selfie, in / })).toBeVisible();
  } finally {
    await db.appSetting.update({ where: { key: 'attendance.selfie' }, data: { value: { mode: 'off', retentionDays: 90 } } });
  }
});
