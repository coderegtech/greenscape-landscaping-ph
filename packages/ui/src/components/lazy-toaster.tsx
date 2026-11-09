'use client';
import dynamic from 'next/dynamic';

// The toaster renders nothing until a toast fires, so its library loads after the page instead of with it.
export const LazyToaster = dynamic(() => import('./sonner').then((m) => m.Toaster), { ssr: false });
