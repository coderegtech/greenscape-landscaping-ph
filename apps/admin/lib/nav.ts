import type { AdminNavGroup } from '@greenscape/ui/layout/admin-shell';
import type { MeResponse } from '@greenscape/validation';

type Item = { label: string; href: string; permission: string; ready: boolean };

// Full admin information architecture. `ready` flips as each phase ships its pages, so the menu never links to a 404.
const IA: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', href: '/', permission: 'admin.access', ready: true }] },
  {
    title: 'Shop',
    items: [
      { label: 'Orders', href: '/orders', permission: 'orders.read', ready: true },
      { label: 'Products', href: '/products', permission: 'products.read', ready: true },
      { label: 'Inventory', href: '/inventory', permission: 'inventory.read', ready: true },
      { label: 'Customers', href: '/customers', permission: 'customers.read', ready: false },
    ],
  },
  {
    title: 'Enquiries',
    items: [
      { label: 'Quotations', href: '/quotations', permission: 'quotations.read', ready: true },
      { label: 'Messages', href: '/messages', permission: 'messages.read', ready: false },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Pages', href: '/cms/pages', permission: 'cms.read', ready: true },
      { label: 'Services', href: '/cms/services', permission: 'cms.read', ready: true },
      { label: 'Projects', href: '/cms/projects', permission: 'cms.read', ready: true },
      { label: 'Stories', href: '/cms/articles', permission: 'cms.read', ready: true },
      { label: 'Gallery', href: '/cms/gallery', permission: 'cms.read', ready: true },
      { label: 'FAQs', href: '/cms/faqs', permission: 'cms.read', ready: true },
      { label: 'Testimonials', href: '/cms/testimonials', permission: 'testimonials.moderate', ready: true },
      { label: 'Media', href: '/media', permission: 'media.read', ready: true },
      { label: 'Site settings', href: '/cms/site', permission: 'cms.read', ready: true },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/employees', permission: 'employees.read', ready: true },
      { label: 'Attendance', href: '/attendance', permission: 'attendance.read', ready: true },
      { label: 'Leave', href: '/leave', permission: 'leave.read', ready: true },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Attendance report', href: '/reports/attendance', permission: 'reports.attendance', ready: true },
      { label: 'Reports', href: '/reports', permission: 'reports.sales', ready: false },
      { label: 'Users & roles', href: '/users', permission: 'users.read', ready: false },
      { label: 'Delivery areas', href: '/settings/delivery', permission: 'settings.read', ready: true },
      { label: 'Settings', href: '/settings', permission: 'settings.read', ready: false },
    ],
  },
];

export function navFor(me: MeResponse): AdminNavGroup[] {
  return IA.map((g) => ({ title: g.title, items: g.items.filter((i) => i.ready && me.permissions.includes(i.permission)) })).filter((g) => g.items.length > 0);
}
