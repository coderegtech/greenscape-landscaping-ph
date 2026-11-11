import type { CSSProperties, ReactNode } from 'react';
import { Blob, Branch, Daisy, Fern, Flower, Petal, Pollen, Seedling, SplitLeaf, TropicalLeaf } from '../hero/botanicals';

/** Brief palette: greens carry the foliage, pastels stay small. */
export const P = { green: '#315c3b', leaf: '#3f7a4c', sage: '#8ca68a', lime: '#c9e64a', pink: '#f5b7c5', yellow: '#f7d97b', lavender: '#c9b8e8', peach: '#f3b994', mint: '#dcefe0' };

export type Motion = 'float' | 'sway' | 'drift' | 'fall' | 'pulse' | 'none';

/**
 * One decoration. Placement zones keep it off content (see accents.tsx):
 *   - band: inside a section's top or bottom padding (`top`/`bottom` ≤ 2rem, size ≤ 36px); safe at every width;
 *   - gutter: beside the 80rem column, `show: 'xl'` only (≥ 1440px leaves ≥ 120px each side), may be large and
 *     partly off-screen (the host clips it).
 */
export interface Accent {
  art: ReactNode;
  at: CSSProperties;
  size: string;
  motion?: Motion;
  /** base rotation, degrees */
  r?: number;
  o?: number;
  /** seconds */
  dur?: number;
  dl?: number;
  /** scroll parallax travel in px (±), CSS view timeline; 0 = none */
  py?: number;
  /** smallest width it appears at: all, md (768px), xl (1440px) */
  show?: 'all' | 'md' | 'xl';
}

const top = (t: string, side: 'left' | 'right', x: string): CSSProperties => ({ top: t, [side]: x });
const bottom = (b: string, side: 'left' | 'right', x: string): CSSProperties => ({ bottom: b, [side]: x });

export const SETS = {
  /** Home "four ways" and the services index: leaves and a seedling around the cards. */
  services: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('0.75rem', 'right', '9%'), size: '30px', motion: 'float' },
    { art: <Pollen color={P.yellow} />, at: top('1.6rem', 'right', '14%'), size: '18px', motion: 'pulse', show: 'md' },
    { art: <Seedling color={P.sage} />, at: bottom('0.6rem', 'left', '6%'), size: '34px', motion: 'sway', show: 'md' },
    { art: <TropicalLeaf color={P.mint} vein="#fff" />, at: top('28%', 'left', '-34px'), size: '120px', motion: 'sway', r: 32, py: 30, show: 'xl' },
    { art: <Flower petal={P.lavender} center={P.peach} />, at: top('58%', 'right', '2%'), size: '34px', motion: 'float', py: -20, show: 'xl' },
  ],
  /** Project previews: a flowering branch and a fern beside the photographs. */
  projects: [
    { art: <Daisy />, at: top('0.75rem', 'left', '5%'), size: '30px', motion: 'float' },
    { art: <Petal color={P.pink} />, at: top('1.1rem', 'left', '11%'), size: '18px', motion: 'drift', r: -20, show: 'md' },
    { art: <Pollen color={P.peach} />, at: top('1.3rem', 'right', '7%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <Branch color={P.sage} bud={P.lavender} />, at: top('16%', 'right', '-30px'), size: '140px', motion: 'sway', r: -20, py: 36, show: 'xl' },
    { art: <Fern color={P.sage} />, at: bottom('10%', 'left', '-18px'), size: '100px', motion: 'sway', r: 18, py: -24, show: 'xl' },
  ],
  /** Testimonials: soft pastel blossoms. */
  testimonials: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('0.7rem', 'right', '6%'), size: '32px', motion: 'float' },
    { art: <Flower petal={P.lavender} center={P.yellow} />, at: top('1.6rem', 'right', '11%'), size: '22px', motion: 'float', dl: -3, show: 'md' },
    { art: <Pollen color={P.yellow} />, at: bottom('0.8rem', 'left', '8%'), size: '18px', motion: 'pulse', show: 'md' },
    { art: <Petal color={P.peach} />, at: top('26%', 'left', '2%'), size: '22px', motion: 'fall', show: 'xl' },
    { art: <Blob color={P.mint} />, at: top('38%', 'left', '-70px'), size: '170px', motion: 'pulse', o: 0.7, py: 20, show: 'xl' },
  ],
  /** The quote invitation: foliage reaching in from both sides. */
  cta: [
    { art: <Flower petal={P.yellow} center={P.peach} />, at: top('0.9rem', 'left', '8%'), size: '26px', motion: 'float' },
    { art: <Daisy />, at: top('0.75rem', 'right', '18%'), size: '30px', motion: 'float', show: 'md' },
    { art: <Pollen color={P.lime} />, at: bottom('0.7rem', 'right', '30%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <SplitLeaf color={P.green} />, at: bottom('-12px', 'left', '-50px'), size: '150px', motion: 'sway', r: 20, py: 24, show: 'xl' },
    { art: <TropicalLeaf color={P.sage} vein={P.mint} />, at: top('8%', 'right', '-30px'), size: '110px', motion: 'sway', r: -30, py: -30, show: 'xl' },
  ],
  /** Stories: daisies, a seedling and a couple of falling petals in the margins. */
  stories: [
    { art: <Daisy />, at: top('0.7rem', 'left', '7%'), size: '28px', motion: 'float' },
    { art: <Pollen color={P.yellow} />, at: top('1.4rem', 'left', '12%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <Seedling />, at: bottom('0.6rem', 'right', '10%'), size: '34px', motion: 'sway', show: 'md' },
    { art: <Petal color={P.pink} />, at: top('18%', 'right', '3%'), size: '20px', motion: 'fall', show: 'xl' },
    { art: <Petal color={P.lavender} />, at: top('44%', 'right', '6%'), size: '16px', motion: 'fall', dl: -6, show: 'xl' },
  ],
  /** Article header: two small blooms in the top margin, nothing near the text. */
  article: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('1.2rem', 'right', '4%'), size: '28px', motion: 'float' },
    { art: <Daisy />, at: top('2.2rem', 'right', '9%'), size: '20px', motion: 'float', dl: -2, show: 'md' },
    { art: <Pollen color={P.lavender} />, at: top('1.5rem', 'right', '14%'), size: '14px', motion: 'pulse', show: 'md' },
  ],
  /** About and other editorial text: a branch and a pale leaf, refined. */
  editorial: [
    { art: <Pollen color={P.lavender} />, at: top('1.4rem', 'left', '9%'), size: '16px', motion: 'pulse' },
    { art: <Flower petal={P.peach} center={P.yellow} />, at: top('0.8rem', 'right', '10%'), size: '26px', motion: 'float', show: 'md' },
    { art: <Branch color={P.sage} bud={P.pink} />, at: top('20%', 'left', '-24px'), size: '120px', motion: 'sway', r: 12, py: 28, show: 'xl' },
    { art: <TropicalLeaf color={P.mint} vein="#fff" />, at: bottom('6%', 'right', '-30px'), size: '100px', motion: 'sway', r: -28, py: -24, show: 'xl' },
  ],
  /** Projects, gallery: corner accents only; the photographs stay the focus. */
  gallery: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('0.8rem', 'right', '6%'), size: '28px', motion: 'float' },
    { art: <Daisy />, at: top('1.5rem', 'right', '11%'), size: '20px', motion: 'float', dl: -4, show: 'md' },
    { art: <Fern color={P.sage} />, at: top('22%', 'left', '-16px'), size: '90px', motion: 'sway', r: -12, py: 30, show: 'xl' },
    { art: <Petal color={P.yellow} />, at: top('48%', 'right', '2%'), size: '18px', motion: 'fall', show: 'xl' },
  ],
  /** A project's hero: bottom margin and gutters only (the hero's top padding is too small for accents). */
  project: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: bottom('0.6rem', 'right', '6%'), size: '28px', motion: 'float' },
    { art: <Daisy />, at: bottom('1rem', 'right', '11%'), size: '20px', motion: 'float', dl: -4, show: 'md' },
    { art: <Fern color={P.sage} />, at: top('22%', 'left', '-16px'), size: '90px', motion: 'sway', r: -12, py: 30, show: 'xl' },
  ],
  /** Any other page header. */
  header: [
    { art: <Flower petal={P.lavender} center={P.yellow} />, at: top('1rem', 'right', '8%'), size: '26px', motion: 'float', show: 'md' },
    { art: <Pollen color={P.yellow} />, at: top('1.9rem', 'right', '13%'), size: '16px', motion: 'pulse' },
    { art: <TropicalLeaf color={P.sage} vein={P.mint} />, at: top('28%', 'right', '-34px'), size: '110px', motion: 'sway', r: -24, py: -26, show: 'xl' },
    { art: <Daisy />, at: top('55%', 'left', '3%'), size: '26px', motion: 'float', show: 'xl' },
  ],
  /** Contact and quote: welcoming blooms around the heading, never the form. */
  contact: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('1rem', 'right', '7%'), size: '30px', motion: 'float' },
    { art: <Daisy />, at: top('2rem', 'right', '12%'), size: '22px', motion: 'float', dl: -3, show: 'md' },
    { art: <SplitLeaf color={P.sage} />, at: top('18%', 'left', '-44px'), size: '130px', motion: 'sway', r: 18, py: 24, show: 'xl' },
    { art: <Petal color={P.peach} />, at: top('58%', 'right', '3%'), size: '18px', motion: 'fall', show: 'xl' },
  ],
  /** Shop headers: a seedling and a little lime; nothing near products or prices. */
  shop: [
    { art: <Seedling />, at: top('0.9rem', 'right', '8%'), size: '30px', motion: 'sway' },
    { art: <Pollen color={P.lime} />, at: top('1.8rem', 'right', '13%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <TropicalLeaf color={P.mint} vein="#fff" />, at: top('26%', 'left', '-30px'), size: '100px', motion: 'sway', r: 26, py: 24, show: 'xl' },
    { art: <Flower petal={P.peach} center={P.yellow} />, at: top('40%', 'right', '2%'), size: '26px', motion: 'float', show: 'xl' },
  ],
  /** The forest footer's top edge: pastel blooms read well on the dark green. */
  footer: [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: top('0.9rem', 'right', '8%'), size: '30px', motion: 'float' },
    { art: <Daisy />, at: top('1.6rem', 'right', '13%'), size: '22px', motion: 'float', dl: -2, show: 'md' },
    { art: <Pollen color={P.yellow} />, at: top('1.9rem', 'left', '20%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <Branch color={P.sage} bud={P.lavender} />, at: top('1rem', 'right', '0.5%'), size: '90px', motion: 'sway', r: -30, show: 'xl' },
  ],
  /* Service page heroes: one character each, same system; bottom margin and gutters only. */
  'garden-design': [
    { art: <Flower petal={P.pink} center={P.yellow} />, at: bottom('0.6rem', 'right', '7%'), size: '28px', motion: 'float' },
    { art: <Daisy />, at: bottom('1rem', 'right', '12%'), size: '20px', motion: 'float', dl: -3, show: 'md' },
    { art: <Flower petal={P.lavender} center={P.peach} />, at: top('30%', 'left', '2%'), size: '30px', motion: 'float', py: 20, show: 'xl' },
    { art: <Petal color={P.pink} />, at: top('50%', 'right', '3%'), size: '18px', motion: 'fall', show: 'xl' },
  ],
  'garden-essentials': [
    { art: <Seedling />, at: bottom('0.5rem', 'right', '8%'), size: '28px', motion: 'sway' },
    { art: <Seedling color={P.sage} />, at: bottom('0.6rem', 'right', '12%'), size: '20px', motion: 'sway', dl: -2, show: 'md' },
    { art: <Pollen color={P.lime} />, at: bottom('0.8rem', 'left', '9%'), size: '16px', motion: 'pulse', show: 'md' },
    { art: <Blob color={P.mint} />, at: top('30%', 'left', '-70px'), size: '160px', motion: 'pulse', o: 0.7, py: 20, show: 'xl' },
  ],
  landscaping: [
    { art: <Flower petal={P.yellow} center={P.peach} />, at: bottom('0.7rem', 'left', '7%'), size: '26px', motion: 'float' },
    { art: <TropicalLeaf color={P.sage} vein={P.mint} />, at: top('20%', 'right', '-30px'), size: '120px', motion: 'sway', r: -26, py: -30, show: 'xl' },
    { art: <SplitLeaf color={P.green} />, at: bottom('6%', 'left', '-46px'), size: '130px', motion: 'sway', r: 22, py: 26, show: 'xl' },
  ],
  'garden-maintenance': [
    { art: <Seedling />, at: bottom('0.5rem', 'right', '9%'), size: '28px', motion: 'sway' },
    { art: <Branch color={P.sage} bud={P.yellow} />, at: top('18%', 'left', '-24px'), size: '120px', motion: 'sway', r: 14, py: 28, show: 'xl' },
    { art: <Fern color={P.sage} />, at: bottom('8%', 'right', '-18px'), size: '96px', motion: 'sway', r: -16, py: -22, show: 'xl' },
  ],
} satisfies Record<string, Accent[]>;

export type AccentSet = keyof typeof SETS;
