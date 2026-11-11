// Single source for roles and permissions. The seed writes these to Postgres; the API enforces them.
// Changing a role here + `pnpm db:seed` syncs the database (removed grants are revoked).

export const PERMISSIONS = {
  'admin.access': 'Sign in to the admin app',
  'users.read': 'View users and their roles',
  'users.manage': 'Suspend/reactivate users',
  'roles.manage': 'Grant and revoke roles (except super admin)',
  'roles.manage_super': 'Grant and revoke the super admin role',
  'settings.read': 'View site settings',
  'settings.manage': 'Change site settings',
  'settings.secrets': 'View/change integration secrets',
  'audit.read': 'View the audit log',

  'cms.read': 'View CMS content including drafts',
  'cms.write': 'Edit CMS drafts',
  'cms.publish': 'Publish, schedule, unpublish and roll back content',
  'media.read': 'Browse the media library',
  'media.write': 'Upload and delete media',
  'testimonials.moderate': 'Approve or reject testimonials',

  'products.read': 'View products including hidden ones',
  'products.write': 'Create/edit products, variants and prices',
  'inventory.read': 'View stock levels and movements',
  'inventory.adjust': 'Receive and adjust stock',
  'orders.read': 'View all orders',
  'orders.manage': 'Cancel orders and edit order details',
  'orders.fulfill': 'Update fulfilment status',
  'payments.refund': 'Issue refunds',
  'customers.read': 'View customer profiles',
  'reports.sales': 'View sales reports',

  'quotations.read': 'View quotation requests',
  'quotations.manage': 'Update, assign and annotate quotations',
  'messages.read': 'Read customer conversations',
  'messages.reply': 'Reply to customer conversations',
  'assistant.manage': 'Configure the AI assistant: instructions, greeting, availability, model, knowledge sources',
  'assistant.read': 'Read AI assistant conversations of customers, and usage (personal data: admins only by default)',
  'notifications.broadcast': 'Send announcements to staff or customers',

  'employees.read': 'View employee records',
  'employees.manage': 'Create/edit employees and schedules',
  'attendance.read': 'View all attendance',
  'attendance.manage': 'Correct attendance records',
  'attendance.approve': 'Approve attendance and corrections',
  'leave.read': 'View all leave requests',
  'leave.approve': 'Approve or reject leave',
  'reports.attendance': 'View attendance reports',

  'profile.self': 'Manage own profile',
  'orders.self': 'View own orders',
  'quotations.self': 'View own quotation requests',
  'attendance.self': 'Clock in/out and view own attendance',
  'leave.self': 'Request leave and view own balances',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Grants may use a trailing wildcard ("cms.*") or "*"; expanded against PERMISSIONS at seed time. */
type Grant = PermissionKey | `${string}.*` | '*';
interface RoleDef { name: string; grants: Grant[]; except?: PermissionKey[] }

export const ROLES = {
  super_admin: { name: 'Super Administrator', grants: ['*'] },
  admin: { name: 'Administrator', grants: ['*'], except: ['roles.manage_super', 'settings.secrets'] },
  content_manager: { name: 'Content Manager', grants: ['admin.access', 'cms.*', 'media.*', 'testimonials.moderate', 'quotations.read', 'messages.read', 'messages.reply', 'assistant.manage', 'profile.self'] },
  ecommerce_manager: {
    name: 'E-commerce Manager',
    grants: ['admin.access', 'products.*', 'inventory.*', 'orders.read', 'orders.manage', 'orders.fulfill', 'payments.refund', 'customers.read', 'reports.sales', 'quotations.read', 'quotations.manage', 'messages.read', 'messages.reply', 'media.read', 'media.write', 'profile.self'],
  },
  inventory_staff: { name: 'Inventory Staff', grants: ['admin.access', 'products.read', 'inventory.read', 'inventory.adjust', 'orders.read', 'orders.fulfill', 'profile.self'] },
  hr_manager: {
    name: 'HR / Attendance Manager',
    grants: ['admin.access', 'employees.*', 'attendance.read', 'attendance.manage', 'attendance.approve', 'leave.read', 'leave.approve', 'reports.attendance', 'profile.self'],
  },
  employee: { name: 'Employee', grants: ['attendance.self', 'leave.self', 'profile.self'] },
  customer: { name: 'Customer', grants: ['profile.self', 'orders.self', 'quotations.self'] },
} as const satisfies Record<string, RoleDef>;

export type RoleKey = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];
/** Every signed-in user gets this on first sight. */
export const DEFAULT_ROLE: RoleKey = 'customer';
/** Roles only a holder of roles.manage_super may grant or revoke. */
export const PROTECTED_ROLES: RoleKey[] = ['super_admin'];

export function expandGrants(role: RoleDef): PermissionKey[] {
  const out = new Set<PermissionKey>();
  for (const g of role.grants) {
    if (g === '*') ALL_PERMISSIONS.forEach((p) => out.add(p));
    else if (g.endsWith('.*')) ALL_PERMISSIONS.filter((p) => p.startsWith(g.slice(0, -1))).forEach((p) => out.add(p));
    else out.add(g as PermissionKey);
  }
  for (const e of role.except ?? []) out.delete(e);
  return [...out].sort();
}

/**
 * What a person can do about their own records only (the customer and employee roles). Everything else is a staff
 * permission and, with REQUIRE_STAFF_MFA, needs a multi-factor session (aal2).
 */
export const SELF_SERVICE_PERMISSIONS: ReadonlySet<string> = new Set([...expandGrants(ROLES.customer), ...expandGrants(ROLES.employee)]);
