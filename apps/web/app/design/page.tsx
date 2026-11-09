import { Badge } from '@greenscape/ui/components/badge';
import { Photo } from '@greenscape/ui/components/photo';
import { ProductGridSkeleton, TableSkeleton } from '@greenscape/ui/components/skeletons';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { FieldIndex } from '@greenscape/ui/layout/field-index';
import { PageHero } from '@greenscape/ui/layout/page-hero';
import { Section, SectionHeading } from '@greenscape/ui/layout/primitives';
import { Counter } from '@greenscape/ui/motion/counter';
import { Reveal } from '@greenscape/ui/motion/reveal';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ButtonStates, Disclosure, FormStates, Overlays, QuantityStepper } from './demos';

export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

// Real Greenscape photographs from the current public site (docs/audit), until migration copies them to Supabase Storage.
const FB = 'https://firebasestorage.googleapis.com/v0/b/greenscape-palawan.firebasestorage.app/o/';
const photos = {
  hero: `${FB}gallery%2F1764829970404_1763279595017_IMG_8872.webp?alt=media&token=0a50d2a4-d614-4937-ac7e-8ee8cbd4e0c0`,
  a: `${FB}projects%2F1764744791276_1763286976144_2D4B9E09-D529-4446-92C7-4ED9F0B3A1A0.webp?alt=media&token=bf503c38-4e9e-4f5f-bc02-9e1cbc565039`,
  b: `${FB}projects%2F1764745511032_1763287684002_IMG_2705.webp?alt=media&token=c931940b-e2a0-4d9a-b899-0592a7c6b914`,
  c: `${FB}projects%2F1764744033431_1763360561816_IMG_7933.webp?alt=media&token=0bea3392-3f05-473a-9288-40562a6845df`,
};

const swatches = [
  ['paper', 'Ground'],
  ['paper-2', 'Deep band'],
  ['paper-3', 'Well'],
  ['brand', 'Brand green'],
  ['rule', 'Rule'],
  ['muted', 'Muted text'],
  ['ink-2', 'Body text'],
  ['ink', 'Ink'],
  ['signal', 'Signal'],
  ['signal-deep', 'Moss'],
  ['danger', 'Danger'],
] as const;

const scale = [
  ['text-display', 'Display', 'Green today, greener tomorrow.'],
  ['text-display-s', 'Display small', 'Gardens built for Palawan heat'],
  ['text-4xl', '4xl', 'Featured projects'],
  ['text-3xl', '3xl', 'Garden maintenance'],
  ['text-2xl', '2xl', 'Areca palm'],
  ['text-xl', 'xl', 'Site visit and consultation'],
] as const;

function Block({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <Section rule labelledBy={id}>
      <SectionHeading id={id} title={title} lead={lead} />
      {children}
    </Section>
  );
}

export default function DesignSystemPage() {
  if (process.env.ENABLE_DESIGN_GALLERY !== 'true') notFound();
  return (
    <main id="main">
      <PageHero
        title="Gardens shaped for Palawan."
        lead="The Greenscape design system: tokens, type, controls and motion, on real project photographs."
        image={{ src: photos.hero, alt: 'Pool deck below a planted tropical hillside at a resort Greenscape landscaped' }}
        actions={<a href="#tokens" className="inline-flex h-12 items-center rounded-pill bg-signal px-6 text-sm font-bold text-signal-ink no-underline hover:bg-signal-2">See the tokens</a>}
      />

      <Block id="tokens" title="Colour" lead="Leaf green on the brand hue, cream ink, one chartreuse signal.">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map(([token, name]) => (
            <li key={token} className="flex flex-col gap-2">
              <span className="photo-frame block h-20" style={{ background: `var(--color-${token})` }} />
              <span className="text-sm text-ink">{name}</span>
              <code className="text-xs text-muted">--color-{token}</code>
            </li>
          ))}
        </ul>
        <div className="band-cream mt-10 flex flex-col gap-3 p-6">
          <p className="font-display text-2xl text-ink">The cream band</p>
          <p className="max-w-[60ch]">One per page at most, for the densest section. Controls turn brand green here; chartreuse never sits on cream.</p>
        </div>
      </Block>

      <Block id="type" title="Type" lead="Prata for names and headings, Manrope for everything you read and use.">
        <ul className="flex flex-col border-t border-rule">
          {scale.map(([cls, name, sample]) => (
            <li key={cls} className="grid grid-cols-1 items-baseline gap-2 border-b border-rule py-4 md:grid-cols-[8rem_minmax(0,1fr)]">
              <span className="label">{name}</span>
              <span className={`font-display text-ink ${cls}`}>{sample}</span>
            </li>
          ))}
          <li className="grid grid-cols-1 items-baseline gap-2 border-b border-rule py-4 md:grid-cols-[8rem_minmax(0,1fr)]">
            <span className="label">Body 17px</span>
            <p className="max-w-[62ch]">
              We assess the area, discuss the client’s vision, budget and maintenance needs, and check soil, sunlight, water supply and drainage. Site visits within the city are free.
            </p>
          </li>
          <li className="grid grid-cols-1 items-baseline gap-2 border-b border-rule py-4 md:grid-cols-[8rem_minmax(0,1fr)]">
            <span className="label">Label 14px</span>
            <span className="label">Terminalia mantaly</span>
          </li>
        </ul>
      </Block>

      <Block id="controls" title="Buttons" lead="One filled primary per screen. Hover lightens, press settles 2%, focus is instant.">
        <ButtonStates />
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge>New</Badge>
          <Badge variant="signal">Best seller</Badge>
          <Badge variant="muted">Indoor and shade</Badge>
          <Badge variant="danger">Out of stock</Badge>
        </div>
      </Block>

      <Block id="forms" title="Form fields" lead="Square fields on the deeper green, 48px tall, errors in words.">
        <FormStates />
      </Block>

      <Block id="overlays" title="Dialogs, toasts and tooltips">
        <Overlays />
      </Block>

      <Block id="disclosure" title="Accordion and tabs">
        <Disclosure />
      </Block>

      <Block id="cart" title="Quantity and price" lead="Figures in Prata, tabular, the change announced to screen readers.">
        <QuantityStepper />
      </Block>

      <Section band="deep" labelledBy="index">
        <SectionHeading id="index" title="Four ways we work" lead="The field-guide index carries a section without a photograph." />
        <FieldIndex
          label="Services"
          items={[
            { name: 'Garden design', latin: 'Concept and plan', line: 'Perspectives and a bill of quantities.', href: '#index' },
            { name: 'Landscaping', latin: 'Installation', line: 'Hardscape, planting, lighting and irrigation.', href: '#index' },
            { name: 'Garden maintenance', latin: 'Aftercare', line: 'Watering, pruning, feeding and pest control.', href: '#index' },
            { name: 'Garden essentials', latin: 'Plants and supplies', line: 'Plants, pots, soil and tools from our nursery.', href: '#index' },
          ]}
        />
      </Section>

      <Block id="photos" title="Photographs" lead="True colour, square, a hairline cream ring; the frame opens as it scrolls in.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {[
            [photos.a, 'Residential garden, Puerto Princesa'],
            [photos.b, 'Beachside landscaping'],
            [photos.c, 'Botanical garden rehabilitation'],
          ].map(([src, caption], i) => (
            <Reveal key={src} kind="mask" index={i}>
              <Photo src={src!} alt={caption!} caption={caption} ratio="4 / 5" sizes="(min-width: 48rem) 33vw, 100vw" />
            </Reveal>
          ))}
        </div>
      </Block>

      <Block id="figures" title="Figures" lead="Only numbers the business stands behind; this sample uses the current site's own claims.">
        <dl className="grid grid-cols-2 border-t border-rule md:grid-cols-4">
          {[
            [50, '+', 'Projects'],
            [200, '+', 'Products'],
            [100, '+', 'Installations'],
            [150, '+', 'Clients'],
          ].map(([v, s, l], i) => (
            <div key={l as string} className={`flex flex-col gap-1 py-6 ${i > 0 ? 'md:border-l md:border-rule md:pl-6' : ''}`}>
              <dt className="label order-2">{l}</dt>
              <dd className="order-1 text-display-s text-ink">
                <Counter value={v as number} suffix={s as string} />
              </dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block id="table" title="Table" lead="Horizontal rules only, sentence-case heads, tabular figures.">
        <Table label="Sample orders">
            <TableHeader>
              <TableRow className="border-rule hover:bg-transparent">
                <TableHead className="text-muted">Order</TableHead>
                <TableHead className="text-muted">Customer</TableHead>
                <TableHead className="text-muted">Status</TableHead>
                <TableHead className="text-right text-muted">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['GS-2026-000120', 'Example Kitchen', 'Paid', '₱4,500.00'],
                ['GS-2026-000121', 'Sample Resort', 'Preparing', '₱18,750.00'],
                ['GS-2026-000122', 'Test Customer', 'Pending payment', '₱1,250.00'],
              ].map(([n, c, st, t]) => (
                <TableRow key={n} className="border-rule hover:bg-paper-3">
                  <TableCell className="tabular text-ink">{n}</TableCell>
                  <TableCell>{c}</TableCell>
                  <TableCell>
                    <Badge variant={st === 'Paid' ? 'signal' : 'outline'}>{st}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-right text-ink">{t}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </Block>

      <Block id="loading" title="Loading states" lead="Skeletons at the final size, so nothing shifts when data lands.">
        <ProductGridSkeleton count={4} />
        <div className="mt-10">
          <TableSkeleton rows={3} columns={4} />
        </div>
      </Block>
    </main>
  );
}
