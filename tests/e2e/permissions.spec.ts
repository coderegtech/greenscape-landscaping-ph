import { ROLES, expandGrants, type RoleKey } from '@greenscape/database/rbac';
import { expect, test } from '@playwright/test';
import { ADMIN_IA } from '../../apps/admin/lib/nav';
import { ADMIN, signIn, staffUser } from './helpers';

// Permission matrix (Phase 10 exit criterion): for every role, the admin menu shows exactly the pages its permissions
// allow (computed from the RBAC catalogue, the same source the API enforces), each of those pages opens, and every
// other page sends the person back to the overview. Roles without admin.access see the "no access" screen.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

const pages = ADMIN_IA.flatMap((g) => g.items).filter((i) => i.ready);

for (const role of Object.keys(ROLES) as RoleKey[]) {
  test(`role: ${role}`, async ({ page }) => {
    test.setTimeout(180_000); // sign-in + MFA + every admin page; over 90 s under full-suite load
    const perms = new Set<string>(expandGrants(ROLES[role]));
    const u = await staffUser(`perm-${role.replace(/_/g, '')}`, [role]);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, u.email);

    if (!perms.has('admin.access')) {
      await expect(page.getByTestId('no-access')).toBeVisible();
      return;
    }
    await expect(page.getByTestId('staff-identity')).toContainText(role);
    // The dashboard loads and shows the tiles this role is allowed.
    await expect(page.getByText('The figures could not be loaded')).toHaveCount(0);
    for (const [perm, tile] of [['reports.sales', 'tile-sales'], ['orders.read', 'tile-orders'], ['quotations.read', 'tile-quotations'], ['messages.read', 'tile-messages'], ['inventory.read', 'tile-stock'], ['attendance.read', 'tile-attendance'], ['leave.read', 'tile-leave'], ['testimonials.moderate', 'tile-testimonials']] as const) {
      await expect(page.getByTestId(tile), `${role} ${tile}`).toHaveCount(perms.has(perm) ? 1 : 0);
    }

    const allowed = pages.filter((p) => perms.has(p.permission));
    const denied = pages.filter((p) => !perms.has(p.permission));
    const menu = await page.getByRole('navigation', { name: 'Admin' }).getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(menu.sort()).toEqual(allowed.map((p) => p.href).sort());

    for (const p of allowed) {
      const res = await page.goto(`${ADMIN}${p.href}`);
      expect(res?.status(), p.href).toBe(200);
      await expect(page, p.href).toHaveURL(`${ADMIN}${p.href}`);
      await expect(page.getByRole('heading', { level: 2 }).first(), p.href).toBeVisible();
      await expect(page.getByText(/something went wrong/i), p.href).toHaveCount(0);
    }
    for (const p of denied) {
      await page.goto(`${ADMIN}${p.href}`);
      await expect(page, `${role} must not open ${p.href}`).toHaveURL(`${ADMIN}/`);
    }
  });
}
