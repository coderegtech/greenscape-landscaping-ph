import type { FooterColumn, NavItem } from '@greenscape/ui/layout/site-header';

// Static until Phase 6 loads these from the CMS `navigation` / `siteConfig` documents.
// Structure and contact facts follow the current site (docs/audit/routes.md).
export const mainNav: NavItem[] = [
  {
    label: 'Services',
    href: '/services',
    children: [
      { label: 'Garden design', href: '/services/garden-design' },
      { label: 'Garden essentials', href: '/services/garden-essentials' },
      { label: 'Landscaping', href: '/services/landscaping' },
      { label: 'Garden maintenance', href: '/services/garden-maintenance' },
    ],
  },
  {
    label: 'Projects',
    href: '/projects',
    children: [
      { label: 'Residential gardens', href: '/projects?category=residential-garden' },
      { label: 'Commercial landscaping', href: '/projects?category=commercial-landscaping' },
      { label: 'Indoor landscaping', href: '/projects?category=indoor-landscaping' },
      { label: 'Landscape rehabilitation', href: '/projects?category=landscape-rehabilitation' },
    ],
  },
  { label: 'Shop', href: '/shop' },
  { label: 'Stories', href: '/stories' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export const footerColumns: FooterColumn[] = [
  { title: 'Services', links: mainNav[0]!.children! },
  { title: 'Shop', links: [{ label: 'All plants', href: '/shop' }, { label: 'Delivery terms', href: '/delivery-policy' }, { label: 'Your orders', href: '/account' }] },
  { title: 'Company', links: [{ label: 'About Greenscape', href: '/about' }, { label: 'Stories', href: '/stories' }, { label: 'Gallery', href: '/gallery' }, { label: 'Testimonials', href: '/testimonials' }, { label: 'FAQ', href: '/faq' }, { label: 'Privacy notice', href: '/privacy' }] },
];

export const contact = {
  address: 'Tian Suy Go, San Jose, Puerto Princesa, Palawan',
  phone: '0917 844 3330',
  email: 'greenscapepalawan@gmail.com',
};

export const socials = [
  { label: 'Facebook', href: 'https://www.facebook.com/greenscapepalawan' },
  { label: 'Instagram', href: 'https://www.instagram.com/greenscape.palawan/' },
];
