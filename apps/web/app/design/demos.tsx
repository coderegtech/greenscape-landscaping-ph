'use client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@greenscape/ui/components/accordion';
import { Button } from '@greenscape/ui/components/button';
import { Checkbox } from '@greenscape/ui/components/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@greenscape/ui/components/dialog';
import { Label } from '@greenscape/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@greenscape/ui/components/select';
import { toast } from '@greenscape/ui/components/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@greenscape/ui/components/tabs';
import { Textarea } from '@greenscape/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@greenscape/ui/components/tooltip';
import { Field } from '@greenscape/ui/form';
import { SwapNumber } from '@greenscape/ui/motion/presence';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

export function ButtonStates() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Request a quote</Button>
      <Button variant="secondary">Shop plants</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="link">View project</Button>
      <Button variant="danger" size="sm">Remove</Button>
      <Button disabled>Disabled</Button>
      <Button
        loading={loading}
        onClick={() => {
          setLoading(true);
          setTimeout(() => setLoading(false), 1600);
        }}
      >
        {loading ? 'Sending' : 'Click to load'}
      </Button>
      <Button size="sm">Small (app)</Button>
    </div>
  );
}

export function FormStates() {
  return (
    <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
      <Field label="Full name" placeholder="Juan Dela Cruz" autoComplete="name" />
      <Field label="Email" type="email" defaultValue="juan@" error="Enter a valid email address" />
      <Field label="Phone" type="tel" inputMode="tel" hint="We call between 8:00 and 17:00." />
      <Field label="Disabled" disabled defaultValue="Not editable" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="svc" className="text-sm font-medium text-ink">Service</Label>
        <Select>
          <SelectTrigger id="svc" className="h-12 w-full border-muted bg-paper-2 text-base">
            <SelectValue placeholder="Choose a service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="garden-design">Garden design</SelectItem>
            <SelectItem value="landscaping">Landscaping</SelectItem>
            <SelectItem value="maintenance">Garden maintenance</SelectItem>
          </SelectContent>
        </Select>
        <div className="min-h-[1lh]" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="msg" className="text-sm font-medium text-ink">About the garden</Label>
        <Textarea id="msg" placeholder="Size, sun, what you'd like to grow" />
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox id="care" defaultChecked />
        <Label htmlFor="care" className="cursor-pointer text-base text-ink-2">Send me care reminders</Label>
      </div>
    </div>
  );
}

export function Overlays() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent className="border-rule bg-paper-2">
          <DialogHeader>
            <DialogTitle className="text-2xl">Remove this plant?</DialogTitle>
            <DialogDescription className="text-ink-2">The Areca palm will be taken out of your cart.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button onClick={() => toast.success('Removed from cart')}>Remove</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="secondary" onClick={() => toast('Added to cart', { description: 'Areca palm, 3 gal' })}>
        Show toast
      </Button>
      <Button variant="secondary" onClick={() => toast.error('Payment didn’t go through', { description: 'Your card was not charged. Try again or use another method.' })}>
        Error toast
      </Button>
      <TooltipProvider delayDuration={800}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Watering">
            ?
          </Button>
        </TooltipTrigger>
        <TooltipContent>Water 2–3 times a week</TooltipContent>
      </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function Disclosure() {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <Accordion type="single" collapsible className="border-t border-rule">
        {[
          ['Do you visit outside Puerto Princesa?', 'Yes. Site visits within the city are free; beyond it, a visit fee applies by distance.'],
          ['How soon can work start?', 'Usually within two weeks of an approved design, weather permitting.'],
          ['Do you maintain gardens you didn’t build?', 'Yes, after a first visit to assess the plants and irrigation.'],
        ].map(([q, a]) => (
          <AccordionItem key={q} value={q!} className="border-rule">
            <AccordionTrigger className="text-base text-ink hover:no-underline">{q}</AccordionTrigger>
            <AccordionContent className="text-base text-ink-2">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Tabs defaultValue="sizes">
        <TabsList className="h-11 bg-paper-2">
          <TabsTrigger value="sizes" className="px-4 data-[state=active]:bg-paper-3 data-[state=active]:text-ink">Sizes</TabsTrigger>
          <TabsTrigger value="care" className="px-4 data-[state=active]:bg-paper-3 data-[state=active]:text-ink">Care</TabsTrigger>
        </TabsList>
        <TabsContent value="sizes" className="pt-4 text-base text-ink-2">Small 50–100 cm, medium 100–150 cm, large 150–200 cm.</TabsContent>
        <TabsContent value="care" className="pt-4 text-base text-ink-2">Full sun. Water regularly when young; drought-tolerant once established.</TabsContent>
      </Tabs>
    </div>
  );
}

export function QuantityStepper() {
  const [n, setN] = useState(1);
  return (
    <div className="flex items-center gap-4">
      <div className="inline-flex items-center border border-muted bg-paper-2" role="group" aria-label="Quantity">
        <Button variant="ghost" size="icon" className="rounded-none" aria-label="Fewer" disabled={n <= 1} onClick={() => setN((x) => Math.max(1, x - 1))}>
          <Minus />
        </Button>
        <span className="figure w-10 text-center text-xl text-ink">
          <SwapNumber value={n} label="selected" />
        </span>
        <Button variant="ghost" size="icon" className="rounded-none" aria-label="More" onClick={() => setN((x) => x + 1)}>
          <Plus />
        </Button>
      </div>
      <span className="figure text-2xl text-ink">₱{(1250 * n).toLocaleString('en-PH')}</span>
    </div>
  );
}
