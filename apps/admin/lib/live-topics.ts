import type { LiveTopic } from '@greenscape/validation';

/** What the menu badges count: pending orders, low stock, new quotes, messages, corrections, leave, reviews. */
const BADGES: LiveTopic[] = ['orders', 'inventory', 'quotations', 'messages', 'corrections', 'leave', 'cms'];
const PAGES: [prefix: string, topics: LiveTopic[]][] = [
  ['/attendance', ['attendance', 'schedule', 'employees']],
  ['/reports/attendance', ['attendance']],
  ['/employees', ['employees', 'schedule', 'attendance']],
  ['/products', ['products']],
  ['/users', ['users']],
  ['/reports/sales', ['orders']],
];

/** Topics that re-render a console page: the badges everywhere, plus the page's own. */
export function topicsFor(path: string): LiveTopic[] {
  if (path === '/') return [...BADGES, 'attendance']; // the dashboard shows today's attendance and sales too
  return [...new Set([...BADGES, ...PAGES.filter(([p]) => path === p || path.startsWith(`${p}/`)).flatMap(([, t]) => t)])];
}
