'use client';
import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { Spinner } from './button';

/** Toasts read our tokens directly, so they follow the site (green) or admin (cream) theme without a theme provider. */
const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    position="bottom-right"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Spinner />,
    }}
    style={
      {
        '--normal-bg': 'var(--gs-paper-3)',
        '--normal-text': 'var(--gs-ink)',
        '--normal-border': 'var(--gs-rule-strong)',
        '--border-radius': '0px',
        fontFamily: 'var(--font-body)',
        zIndex: 500,
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
export { toast } from 'sonner';
