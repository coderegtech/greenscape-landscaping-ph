// Real browsers, real sockets: an action in one portal shows up in the other without anyone reloading.
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, EMPLOYEE, signIn, staffUser } from './helpers';

const db = createPrismaClient(process.env.DATABASE_URL!);
const tag = `rt${randomUUID().slice(0, 6)}`;
const scheduleIds: string[] = [];

async function linkedEmployee(label: string) {
  const u = await staffUser(label, ['employee']);
  const user = await db.user.findUniqueOrThrow({ where: { email: u.email } });
  const s = await db.workSchedule.create({ data: { name: `RT crew ${tag} ${randomUUID().slice(0, 4)}`, graceMinutes: 10, shifts: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '00:00', endTime: '23:59' })) } } });
  scheduleIds.push(s.id);
  const e = await db.employee.create({ data: { employeeNo: `RT-${randomUUID().slice(0, 6).toUpperCase()}`, firstName: 'Lito', lastName: `Cruz ${tag}`, email: u.email, userId: user.id, scheduleAssignments: { create: { scheduleId: s.id, effectiveFrom: new Date('2026-01-01T00:00:00Z') } } } });
  return { ...u, employee: e };
}
async function session(browser: Browser, url: string, address: string) {
  const page = await (await browser.newContext()).newPage(); // own context: localhost apps share cookies
  await page.goto(`${url}/login`);
  await signIn(page, address);
  await expect(page).toHaveURL(`${url}/`);
  return page;
}
/** Marks the document; if the page reloads, the mark is gone. */
const mark = (p: Page) => p.evaluate(() => { (window as unknown as { __live: boolean }).__live = true; });
const sameDocument = (p: Page) => p.evaluate(() => (window as unknown as { __live?: boolean }).__live === true);
const live = (p: Page) => expect(p.getByTestId('live-status')).toHaveAttribute('data-status', 'connected');

test.afterAll(async () => {
  const emps = await db.employee.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
  await db.attendanceRecord.deleteMany({ where: { employeeId: { in: emps.map((e) => e.id) } } });
  await db.employee.deleteMany({ where: { id: { in: emps.map((e) => e.id) } } });
  await db.workSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
  await db.$disconnect();
});

test.describe('realtime', () => {
  test.skip(({ isMobile }) => isMobile, 'cross-portal flows run on desktop');

  test('a clock-in and clock-out update HR’s open board and the employee’s other device without a reload', async ({ browser }, info) => {
    const hr = await staffUser('rt-hr', ['hr_manager']);
    const w = await linkedEmployee('rt-crew');

    // Browser A: HR with the daily board open.
    const board = await session(browser, ADMIN, hr.email);
    await board.goto(`${ADMIN}/attendance`);
    await live(board);
    const row = board.getByTestId(`row-${w.employee.employeeNo}`);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(/\bin \d/);
    // Browsers B and C: the same employee on a phone and on a desktop.
    const phone = await session(browser, EMPLOYEE, w.email);
    const desk = await session(browser, EMPLOYEE, w.email);
    await Promise.all([live(phone), live(desk)]);
    await Promise.all([mark(board), mark(desk)]);

    await phone.getByRole('button', { name: 'Clock in' }).click();
    await expect(phone.getByTestId('clock-status')).toContainText('Clocked in since'); // the server's answer
    await expect(row).toContainText(/\bin \d/); // HR's board, no reload
    await expect(row).toContainText('Clocked in');
    await expect(desk.getByTestId('clock-status')).toContainText('Clocked in since'); // the other device
    await board.screenshot({ path: info.outputPath('hr-board-after-clock-in.png') });

    // Clock-outs within a minute of the clock-in count as a double tap; move the clock-in back.
    await db.timePunch.updateMany({ where: { record: { employeeId: w.employee.id } }, data: { at: new Date(Date.now() - 5 * 60_000) } });
    await phone.getByRole('button', { name: 'Clock out' }).click();
    await expect(row).toContainText(/\bout \d/);
    await expect(desk.getByTestId('clock-status')).toHaveText('You are not clocked in.');
    await desk.screenshot({ path: info.outputPath('employee-desk-after-clock-out.png') });
    expect([await sameDocument(board), await sameDocument(desk)]).toEqual([true, true]);
    expect(await db.timePunch.count({ where: { record: { employeeId: w.employee.id } } })).toBe(2);
    for (const p of [board, phone, desk]) await p.context().close();
  });

  test('a dropped socket shows “Reconnecting”, comes back by itself, and the page catches up on what it missed', async ({ browser }) => {
    const hr = await staffUser('rt-hr2', ['hr_manager']);
    const w = await linkedEmployee('rt-crew2');
    const ctx = await browser.newContext();
    // Every socket of this context goes through here, so the test can cut it and refuse reconnects.
    let blocked = false;
    const open = new Set<import('@playwright/test').WebSocketRoute>();
    await ctx.routeWebSocket(/\/v1\/realtime\//, (ws) => {
      if (blocked) return void ws.close();
      open.add(ws);
      ws.connectToServer();
    });
    const board = await ctx.newPage();
    await board.goto(`${ADMIN}/login`);
    await signIn(board, hr.email);
    await board.goto(`${ADMIN}/attendance`);
    await live(board);
    await mark(board);
    const row = board.getByTestId(`row-${w.employee.employeeNo}`);
    await expect(row).not.toContainText(/\bin \d/);

    blocked = true;
    await ctx.route('**/v1/realtime/**', (r) => r.abort()); // no long-polling fallback either
    for (const ws of open) await ws.close();
    await expect(board.getByTestId('live-status')).toHaveAttribute('data-status', /reconnecting|offline/);

    // The employee clocks in while HR's socket is down: the event is lost, the record is not.
    const phone = await session(browser, EMPLOYEE, w.email);
    await phone.getByRole('button', { name: 'Clock in' }).click();
    await expect(phone.getByTestId('clock-status')).toContainText('Clocked in since');
    await board.waitForTimeout(1500);
    await expect(row).not.toContainText(/\bin \d/);

    blocked = false;
    await ctx.unroute('**/v1/realtime/**');
    await expect(board.getByTestId('live-status')).toHaveAttribute('data-status', 'connected', { timeout: 40_000 });
    await expect(row).toContainText(/\bin \d/); // re-fetched after the reconnect
    expect(await sameDocument(board)).toBe(true);
    await ctx.close();
    await phone.context().close();
  });
});
