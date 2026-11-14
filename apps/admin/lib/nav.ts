import type { MeResponse } from '@greenscape/validation';

/** `icon` names an entry in nav-icons.tsx; `badge` names a count from the overview (things waiting behind the link). */
type Item = { label: string; href: string; permission: string; ready: boolean; icon: string; badge?: BadgeKey };
export type BadgeKey = 'orders' | 'stock' | 'quotations' | 'messages' | 'corrections' | 'leave' | 'testimonials';
export type NavBadges = Partial<Record<BadgeKey, number>>;

// Full admin information architecture. `ready` flips as each phase ships its pages, so the menu never links to a 404.
// No React here: the permission-matrix e2e test imports this list.
export const ADMIN_IA: { title: string; items: Item[] }[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/', permission: 'admin.access', ready: true, icon: 'dashboard' },
      { label: 'Analytics', href: '/analytics', permission: 'analytics.read', ready: true, icon: 'analytics' },
      { label: 'Notifications', href: '/notifications', permission: 'admin.access', ready: true, icon: 'notifications' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Orders', href: '/orders', permission: 'orders.read', ready: true, icon: 'orders', badge: 'orders' },
      { label: 'Products', href: '/products', permission: 'products.read', ready: true, icon: 'products' },
      { label: 'Inventory', href: '/inventory', permission: 'inventory.read', ready: true, icon: 'inventory', badge: 'stock' },
      { label: 'Customers', href: '/customers', permission: 'customers.read', ready: true, icon: 'customers' },
      { label: 'Quotations', href: '/quotations', permission: 'quotations.read', ready: true, icon: 'quotations', badge: 'quotations' },
      { label: 'Messages', href: '/messages', permission: 'messages.read', ready: true, icon: 'messages', badge: 'messages' },
      { label: 'Sales report', href: '/reports/sales', permission: 'reports.sales', ready: true, icon: 'sales' },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Pages', href: '/cms/pages', permission: 'cms.read', ready: true, icon: 'pages' },
      { label: 'Services', href: '/cms/services', permission: 'cms.read', ready: true, icon: 'services' },
      { label: 'Projects', href: '/cms/projects', permission: 'cms.read', ready: true, icon: 'projects' },
      { label: 'Stories', href: '/cms/articles', permission: 'cms.read', ready: true, icon: 'stories' },
      { label: 'Gallery', href: '/cms/gallery', permission: 'cms.read', ready: true, icon: 'gallery' },
      { label: 'Media', href: '/media', permission: 'media.read', ready: true, icon: 'media' },
      { label: 'Testimonials', href: '/cms/testimonials', permission: 'testimonials.moderate', ready: true, icon: 'testimonials', badge: 'testimonials' },
      { label: 'FAQs', href: '/cms/faqs', permission: 'cms.read', ready: true, icon: 'faqs' },
      { label: 'Site settings', href: '/cms/site', permission: 'cms.read', ready: true, icon: 'site' },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { label: 'Employees', href: '/employees', permission: 'employees.read', ready: true, icon: 'employees' },
      { label: 'Attendance', href: '/attendance', permission: 'attendance.read', ready: true, icon: 'attendance', badge: 'corrections' },
      { label: 'Work schedules', href: '/employees/schedules', permission: 'employees.read', ready: true, icon: 'schedules' },
      { label: 'Leave requests', href: '/leave', permission: 'leave.read', ready: true, icon: 'leave', badge: 'leave' },
      { label: 'Attendance report', href: '/reports/attendance', permission: 'reports.attendance', ready: true, icon: 'report' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users and roles', href: '/users', permission: 'users.read', ready: true, icon: 'users' },
      { label: 'System monitoring', href: '/system', permission: 'system.monitor', ready: true, icon: 'system' },
      { label: 'Settings', href: '/settings', permission: 'settings.read', ready: true, icon: 'settings' },
      { label: 'Audit logs', href: '/audit', permission: 'audit.read', ready: true, icon: 'audit' },
      { label: 'Assistant settings', href: '/assistant', permission: 'assistant.manage', ready: true, icon: 'assistant' },
      { label: 'Assistant knowledge', href: '/assistant/knowledge', permission: 'assistant.manage', ready: true, icon: 'knowledge' },
      { label: 'Assistant chats', href: '/assistant/conversations', permission: 'assistant.read', ready: true, icon: 'chats' },
    ],
  },
];

/** The menu this person may see: only links their permissions open, with the counts waiting behind them. */
export function navFor(me: MeResponse, badges: NavBadges = {}) {
  return ADMIN_IA.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => i.ready && me.permissions.includes(i.permission)).map((i) => ({ label: i.label, href: i.href, icon: i.icon, badge: i.badge ? badges[i.badge] : undefined })),
  })).filter((g) => g.items.length > 0);
}
