/** "1250.00" → "₱1,250.00" (admin always shows centavos). */
export const peso = (amount: string | number) => `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
/** Underlined tab links (aria-current marks the active one). */
export const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';
