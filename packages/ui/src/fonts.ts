import { Manrope, Prata } from 'next/font/google';

// Self-hosted at build time by next/font (no runtime request to Google). Only the weights we use.
export const prata = Prata({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-prata', fallback: ['Georgia', 'serif'] });
export const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-manrope', fallback: ['system-ui', 'sans-serif'] });
export const fontVariables = `${prata.variable} ${manrope.variable}`;
