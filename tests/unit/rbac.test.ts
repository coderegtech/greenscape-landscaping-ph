import { ACCESS_PERMISSIONS, ALL_PERMISSIONS, PERMISSIONS, PERMISSION_GRID, RESERVED_PERMISSIONS, ROLES, expandGrants, type RoleKey } from '@greenscape/database/rbac';
import { safeNext } from '@greenscape/validation';
import { describe, expect, it } from 'vitest';

const perms = (r: RoleKey) => expandGrants(ROLES[r]);

describe('role catalog', () => {
  it('only references permissions that exist', () => {
    for (const role of Object.values(ROLES)) for (const p of expandGrants(role)) expect(PERMISSIONS).toHaveProperty(p);
  });

  it('super admin has everything; admin has everything except super-admin and secrets', () => {
    expect(perms('super_admin')).toEqual([...ALL_PERMISSIONS].sort());
    expect(perms('admin')).not.toContain('roles.manage_super');
    expect(perms('admin')).not.toContain('settings.secrets');
    expect(perms('admin')).toHaveLength(ALL_PERMISSIONS.length - 2);
  });

  it('staff roles can open the admin app; customers and employees cannot', () => {
    for (const r of ['content_manager', 'ecommerce_manager', 'inventory_staff', 'hr_manager'] as const) expect(perms(r)).toContain('admin.access');
    expect(perms('customer')).not.toContain('admin.access');
    expect(perms('employee')).not.toContain('admin.access');
  });

  it('keeps duties separated', () => {
    expect(perms('content_manager').some((p) => p.startsWith('employees.') || p.startsWith('payments.'))).toBe(false);
    expect(perms('hr_manager').some((p) => p.startsWith('orders.') || p.startsWith('cms.'))).toBe(false);
    expect(perms('inventory_staff')).not.toContain('products.write');
    expect(perms('inventory_staff')).not.toContain('payments.refund');
  });
});

describe('role editor grid', () => {
  const cells = [...ACCESS_PERMISSIONS, ...PERMISSION_GRID.flatMap((r) => [r.view, r.create, r.update, r.delete, ...(r.other ?? [])].filter((k) => k !== undefined))];

  it('offers every permission exactly once, so no permission is ungrantable or doubled', () => {
    expect([...cells].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('keeps the keys that define roles and administrators out of reach of custom roles (they are still shown, locked)', () => {
    expect(RESERVED_PERMISSIONS).toEqual(expect.arrayContaining(['roles.define', 'roles.manage_super', 'settings.secrets']));
    expect(perms('admin')).toContain('roles.define');
    for (const r of ['content_manager', 'ecommerce_manager', 'inventory_staff', 'hr_manager', 'employee', 'customer'] as const) expect(perms(r)).not.toContain('roles.define');
  });
});

describe('safeNext (post-login redirect guard)', () => {
  it.each([
    ['/account', '/account'],
    ['/shop?category=palms', '/shop?category=palms'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/'],
  ])('%s → %s', (input, expected) => expect(safeNext(input)).toBe(expected));
});
