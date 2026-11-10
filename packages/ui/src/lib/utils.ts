import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom scale so `text-display` isn't mistaken for a colour (and dropped next to `text-ink`).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['md', 'display', 'display-s'],
      radius: ['card', 'control', 'pill'],
      color: ['paper', 'paper-2', 'paper-3', 'brand', 'ink', 'ink-2', 'muted', 'rule', 'rule-strong', 'signal', 'signal-2', 'signal-deep', 'signal-ink', 'focus', 'danger', 'danger-ink', 'scrim', 'sage', 'lime'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
