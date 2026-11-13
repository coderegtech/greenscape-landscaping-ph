// Admin and employee portal redesign: navigation, dashboards, the notification sound rules, and who hears what.
// Synthetic accounts only (removed by the global teardown and cleanupEmployees).
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Page } from '@playwright/test';
import { call, cleanupEmployees, employeeUser, userWithRoles, type TestUser } from './fixtures/test-users';
import { ADMIN, EMPLOYEE, signIn, signOut } from './helpers';

type Heard = Window & { __sounds: string[] };
/** Records every tone the page actually played (sound-manager dispatches `gs-sound` when one starts). */
const listen = (p: Page) => p.addInitScript(() => {
  (window as unknown as Heard).__sounds = [];
  window.addEventListener('gs-sound', (e) => (window as unknown as Heard).__sounds.push((e as CustomEvent<{ name: string }>).detail.name));
});
const sounds = (p: Page) => p.evaluate(() => (window as unknown as Heard).__sounds);
const badge = (p: Page) => p.getByTestId('notification-badge');
const toggle = (p: Page) => p.getByTestId('sound-toggle');
const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** A notification for exactly one person: a super admin changes that person's roles (a security notice in their inbox). */
async function notify(by: TestUser, target: TestUser, extraRole: string) {
  const res = await call(`/v1/users/${target.userId}/roles`, by.token, { method: 'PUT', body: JSON.stringify({ roles: ['admin', extraRole] }) });
  expect(res.status, await res.text()).toBe(200);
}

test.afterAll(() => cleanupEmployees('Tester pr-'));

test.describe('admin console', () => {
  test.skip(({ isMobile }) => isMobile, 'the sidebar is the desktop layout; phones are covered by the drawer test below');

  test('sidebar groups, collapse is remembered, dashboard figures, account menu', async ({ page }) => {
    const s = await userWithRoles('pr-super', ['super_admin']);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, s.email);
    const nav = page.getByRole('navigation', { name: 'Admin' });
    for (const group of ['Overview', 'Business', 'Content', 'Workforce', 'Administration']) await expect(nav.getByRole('group', { name: group })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    // Real figures from the API: every tile shows a number, the charts and panels are there.
    await expect(page.getByTestId('tile-orders')).toContainText(/\d/);
    await expect(page.getByTestId('tile-sales')).toContainText('₱');
    for (const panel of ['Sales', 'Waiting for a decision', 'Attendance today', 'Latest orders', 'System status']) await expect(page.getByRole('heading', { name: panel, exact: true })).toBeVisible();
    await expect(page.getByTestId('api-status')).toHaveText('ok');

    // Collapse to the icon rail; the choice survives a reload; links keep their names for assistive tech.
    const sidebar = page.getByTestId('sidebar');
    await page.getByTestId('sidebar-toggle').click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await page.reload();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect(nav.getByRole('link', { name: /^Orders/ })).toBeVisible();
    await page.getByTestId('sidebar-toggle').click();
    await expect(sidebar).not.toHaveAttribute('data-collapsed', 'true');

    await nav.getByRole('link', { name: /^Orders/ }).click();
    await expect(page).toHaveURL(`${ADMIN}/orders`);
    await expect(nav.getByRole('link', { name: /^Orders/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Orders' }).or(page.getByText('No orders here'))).toBeVisible();

    await page.getByTestId('account-menu').click();
    await expect(page.getByRole('dialog', { name: 'Account' })).toContainText(s.email);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('sounds: off by default, on after the switch, one tab only, muted again, history is silent, logout ends the stream', async ({ page }) => {
    test.setTimeout(150_000);
    const boss = await userWithRoles('pr-boss', ['super_admin']);
    const a = await userWithRoles('pr-admin', ['admin']);
    await listen(page);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, a.email);
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');

    // 1. A new notification arrives while sounds are off: badge and toast, no tone.
    await notify(boss, a, 'content_manager');
    await expect(badge(page)).toHaveText('1');
    expect(await sounds(page)).toEqual([]);

    // 2. "Enable notification sounds": the click unlocks audio and plays one quiet confirmation.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => sounds(page)).toEqual(['chime']);

    // 3. The same person in a second tab: one notification makes exactly one sound across both tabs.
    const tab2 = await page.context().newPage();
    await listen(tab2);
    await tab2.goto(`${ADMIN}/`);
    await expect(badge(tab2)).toHaveText('1');
    await tab2.getByRole('heading', { name: 'Greenscape Admin' }).click(); // a gesture, so this tab may play too
    await notify(boss, a, 'hr_manager');
    await expect(badge(page)).toHaveText('2');
    await expect(badge(tab2)).toHaveText('2');
    await expect.poll(async () => (await sounds(page)).length + (await sounds(tab2)).length).toBe(2); // the chime from step 2 + one alert
    await page.waitForTimeout(1500);
    expect((await sounds(page)).length + (await sounds(tab2)).length).toBe(2);
    expect([...(await sounds(page)), ...(await sounds(tab2))]).toContain('alert'); // account and security notices use the alert tone

    // 4. Mute: the other tab follows, and the next notification is silent.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle(tab2)).toHaveAttribute('aria-pressed', 'false');
    await notify(boss, a, 'inventory_staff');
    await expect(badge(page)).toHaveText('3');
    await page.waitForTimeout(800);
    expect((await sounds(page)).length + (await sounds(tab2)).length).toBe(2);
    await tab2.close();

    // 5. Sounds on again, then a reload with three unread notifications in the inbox: loading history plays nothing.
    const before = (await sounds(page)).length;
    await toggle(page).click();
    await expect.poll(() => sounds(page)).toHaveLength(before + 1);
    await page.reload();
    await expect(badge(page)).toHaveText('3');
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-dropdown').getByTestId('notification')).toHaveCount(3);
    expect(await sounds(page)).toEqual([]);

    // 6. Read state is stored: mark all as read, reload, still read.
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(badge(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await expect(badge(page)).toHaveCount(0);

    // 7. Settings: volume, sound choice and previews are there, and survive a reload.
    await page.goto(`${ADMIN}/notifications`);
    await page.getByRole('tab', { name: 'Settings' }).click();
    const settings = page.getByTestId('sound-settings');
    await expect(settings.getByRole('checkbox', { name: 'Enable notification sounds' })).toBeChecked();
    await settings.getByRole('combobox', { name: 'Sound' }).selectOption({ label: 'Wood block' });
    await settings.getByTestId('preview-approval').click();
    await expect.poll(() => sounds(page)).toContain('approval');
    await page.reload();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByTestId('sound-settings').getByRole('combobox', { name: 'Sound' })).toHaveValue('wood');

    // 8. After sign-out no notification stream is opened again.
    const streams: string[] = [];
    await signOut(page);
    await expect(page).toHaveURL(`${ADMIN}/login`);
    page.on('request', (r) => { if (r.url().includes('/notifications/stream')) streams.push(r.url()); });
    await notify(boss, a, 'content_manager');
    await page.waitForTimeout(1500);
    expect(streams).toEqual([]);
    expect(await sounds(page)).toEqual([]);
  });
});

test.describe('employee portal', () => {
  test('pages fit the screen, navigation works, the calendar shows the day, clock-in is confirmed by the server', async ({ page, isMobile }) => {
    test.setTimeout(150_000);
    const e = await employeeUser('pr-emp');
    await listen(page);
    await page.goto(`${EMPLOYEE}/login`);
    await expect(page.getByRole('heading', { name: 'Greenscape Employees' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await signIn(page, e.email);
    await expect(page.getByRole('heading', { name: 'Hello, Auth' })).toBeVisible();

    // Phones get the bottom bar with the five destinations; wide screens the top navigation.
    const bottom = page.getByTestId('bottom-nav');
    if (isMobile) {
      await expect(bottom).toBeVisible();
      for (const name of ['Dashboard', 'Attendance', 'Schedule', 'Requests', 'Profile']) await expect(bottom.getByRole('link', { name })).toBeVisible();
      await expect(bottom.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(bottom).toBeHidden();
      await expect(page.getByRole('banner').getByRole('link', { name: 'Schedule' })).toBeVisible();
    }

    // Clock in with sounds on: the confirmation, the state and the tone all follow the server's answer.
    await expect(page.getByTestId('attendance-state')).toHaveText('Not clocked in');
    await toggle(page).click();
    await expect.poll(() => sounds(page)).toEqual(['chime']);
    await page.getByRole('button', { name: 'Clock in' }).click();
    await expect(page.getByTestId('clock-confirmed')).toContainText('Recorded at');
    await expect(page.getByTestId('attendance-state')).toHaveText('Clocked in');
    await expect(page.getByTestId('clock-status')).toContainText('Clocked in since');
    await expect.poll(() => sounds(page)).toContain('success');
    await expect(page.getByTestId('today-summary')).not.toContainText('First inNot yet');

    // A second tap straight away is refused by the server: the error is shown, the state stays "Clocked in".
    await page.getByRole('button', { name: 'Clock out' }).click();
    await expect(page.getByText('You clocked in less than a minute ago.')).toBeVisible();
    await expect(page.getByTestId('attendance-state')).toHaveText('Clocked in');
    await expect.poll(() => sounds(page)).toContain('error');

    for (const [path, title] of [['/attendance', 'Attendance'], ['/schedule', 'Schedule'], ['/requests', 'Requests'], ['/profile', 'Profile'], ['/notifications', 'Notifications'], ['/', 'Hello, Auth']] as const) {
      if (isMobile && path !== '/notifications') await bottom.getByRole('link', { name: path === '/' ? 'Dashboard' : title }).click();
      else await page.goto(`${EMPLOYEE}${path}`);
      await expect(page).toHaveURL(`${EMPLOYEE}${path}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      expect(await overflow(page), `${path} overflows`).toBeLessThanOrEqual(0);
    }

    // Calendar: today carries its status in words; picking it shows the day's details; the legend explains the colours.
    await page.goto(`${EMPLOYEE}/attendance`);
    const today = page.getByTestId('month-calendar').locator('button[aria-current=date]');
    await expect(today).toHaveAccessibleName(/Clocked in/);
    await today.click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('day-details')).toContainText('Clocked in');
    await expect(page.getByTestId('day-details')).toContainText('Times');
    await expect(page.getByRole('list', { name: 'What the colours mean' })).toContainText('Approved leave');

    await page.goto(`${EMPLOYEE}/profile`);
    await expect(page.getByTestId('profile-facts')).toContainText(e.email);
  });

  test('a schedule change reaches that employee only, live, and shows on their schedule', async ({ page }) => {
    test.setTimeout(120_000);
    const hr = await userWithRoles('pr-hr', ['hr_manager']);
    const mine = await employeeUser('pr-sched');
    const other = await employeeUser('pr-other');
    await page.goto(`${EMPLOYEE}/login`);
    await signIn(page, mine.email);
    await expect(page.getByTestId('notification-bell')).toBeVisible();
    await expect(badge(page)).toHaveCount(0);

    const name = `Field crew ${randomUUID().slice(0, 6)}`;
    const shifts = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00', breakMinutes: 60 }));
    const made = await call('/v1/hr/schedules', hr.token, { method: 'POST', body: JSON.stringify({ name, shifts }) });
    expect(made.status, await made.clone().text()).toBe(201);
    const { id: scheduleId } = await made.json();
    const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10); // today in Manila
    try {
      const assigned = await call(`/v1/hr/employees/${mine.employeeId}/schedule`, hr.token, { method: 'POST', body: JSON.stringify({ scheduleId, effectiveFrom: day }) });
      expect(assigned.status).toBe(200);

      await expect(badge(page)).toHaveText('1');
      await page.getByTestId('notification-bell').click();
      const item = page.getByTestId('notification-dropdown').getByTestId('notification').first();
      await expect(item).toContainText('Your work schedule changed');
      await item.getByRole('link').click();
      await expect(page).toHaveURL(`${EMPLOYEE}/schedule`);
      await expect(page.getByTestId('schedule-days').first()).toContainText('8:00 AM to 5:00 PM');
      await expect(page.getByText(`You are on "${name}"`)).toBeVisible();

      // The other employee's inbox has nothing, and they cannot read this one by id either.
      const theirs = await (await call('/v1/notifications?app=employee', other.token)).json();
      expect(theirs.items).toEqual([]);
      const own = await (await call('/v1/notifications?app=employee', mine.token)).json();
      expect((await call(`/v1/notifications/${own.items[0].id}/read`, other.token, { method: 'POST' })).status).toBe(404);
      // An employee has no way into the admin's schedule tools.
      expect((await call('/v1/hr/schedules', mine.token)).status).toBe(403);
    } finally {
      const db = createPrismaClient(process.env.DATABASE_URL!);
      await db.scheduleAssignment.deleteMany({ where: { scheduleId } });
      await db.workSchedule.delete({ where: { id: scheduleId } }).catch(() => undefined);
      await db.$disconnect();
    }
  });
});

test('admin on a phone: the menu is a drawer, the dashboard fits', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  const s = await userWithRoles('pr-phone', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, s.email);
  await expect(page.getByTestId('tile-orders')).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const nav = page.getByRole('dialog').getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('group', { name: 'Workforce' })).toBeVisible();
  await nav.getByRole('link', { name: /^Leave requests/ }).click();
  await expect(page).toHaveURL(`${ADMIN}/leave`);
  await expect(page.getByRole('dialog')).toHaveCount(0); // the drawer closes on navigation
  await page.getByTestId('notification-bell').click();
  const box = await page.getByTestId('notification-dropdown').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
