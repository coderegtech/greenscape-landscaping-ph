import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Browser } from '@playwright/test';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

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
async function webSession(browser: Browser, email: string) {
  const ctx = await browser.newContext(); // web and admin share cookies on localhost: keep the two people apart
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login?next=/staff`);
  await signIn(page, email);
  await expect(page).toHaveURL(`${WEB}/staff`);
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
  const page = await webSession(browser, w.email);
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
  const signed = await webSession(browser, w.email); // sign in with JS, then reuse the session without it
  const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: await signed.context().storageState() });
  await signed.context().close();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/staff`);
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByTestId('clock-status')).toContainText('Clocked in since');
  expect(await db.timePunch.count({ where: { record: { employeeId: w.employee.id } } })).toBe(1);
  await ctx.close();
});

test.describe('with HR', () => {
  test.skip(({ isMobile }) => isMobile, 'HR flows run on desktop');

  test('HR adds an employee, who clocks in; a missed day is corrected and approved; leave is approved', async ({ page, browser }) => {
    // HR signs in to the admin and adds the employee with the email of an existing website account.
    const hr = await staffUser('hr', ['hr_manager']);
    const emp = await staffUser('crew', []);
    const s = await schedule();
    await page.goto(`${ADMIN}/login`);
    await signIn(page, hr.email);
    await expect(page.getByTestId('staff-identity')).toBeVisible();
    await page.goto(`${ADMIN}/employees/new`);
    await page.getByLabel('First name').fill('Liza');
    await page.getByLabel('Last name').fill(`Santos ${tag}`);
    await page.getByLabel('Employee number').fill(`E2E-${randomUUID().slice(0, 6).toUpperCase()}`);
    await page.getByLabel('Position').fill('Gardener');
    await page.getByLabel(/^Email/).fill(emp.email);
    await page.getByRole('button', { name: 'Add employee' }).click();
    await expect(page.getByText(`Linked to ${emp.email}`)).toBeVisible();
    await page.getByRole('combobox', { name: 'Schedule' }).selectOption({ label: s.name });
    await page.getByLabel('From').fill(manila(-30));
    await page.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByText(`${s.name}: from ${manila(-30)} onwards`)).toBeVisible();

    // The employee clocks in on the website and asks for yesterday to be corrected.
    const staff = await webSession(browser, emp.email);
    await staff.getByRole('button', { name: 'Clock in' }).click();
    await expect(staff.getByTestId('clock-status')).toContainText('Clocked in since');
    await staff.getByRole('button', { name: 'Ask for a correction' }).click();
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

    // Leave: request on the website, approve in the admin, the employee sees it.
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
