import type { AdminNavGroup } from '@greenscape/ui/layout/admin-shell';
import {
  Activity, BarChart3, Bell, BookOpen, Bot, CalendarCheck, CalendarClock, CalendarDays, CircleHelp, ClipboardList, FileBarChart, FileText, FolderOpen, Globe,
  Images, LayoutDashboard, type LucideIcon, MessageSquare, MessagesSquare, Newspaper, Package, ReceiptText, ScrollText, Settings, ShieldCheck, ShoppingBag,
  Sprout, Star, TrendingUp, UserCog, UserRound, Users, Warehouse,
} from 'lucide-react';
import type { navFor } from './nav';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, analytics: BarChart3, notifications: Bell,
  orders: ShoppingBag, products: Package, inventory: Warehouse, customers: Users, quotations: ReceiptText, messages: MessageSquare, sales: TrendingUp,
  pages: FileText, services: Sprout, projects: FolderOpen, stories: Newspaper, gallery: Images, testimonials: Star, faqs: CircleHelp, site: Globe,
  employees: UserRound, attendance: CalendarCheck, schedules: CalendarClock, leave: CalendarDays, report: FileBarChart,
  users: UserCog, roles: ShieldCheck, system: Activity, settings: Settings, audit: ScrollText, assistant: Bot, knowledge: BookOpen, chats: MessagesSquare,
};

/** Turns the icon names of nav.ts into elements for the shell. */
export function withIcons(groups: ReturnType<typeof navFor>): AdminNavGroup[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => { const Icon = ICONS[i.icon] ?? ClipboardList; return { ...i, icon: <Icon /> }; }) }));
}
