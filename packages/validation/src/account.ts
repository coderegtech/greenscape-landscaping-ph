import { z } from 'zod';
import { PhPhone } from './primitives.ts';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/** What a customer may change about themselves. Email and roles are not here: email belongs to the sign-in provider. */
export const ProfileUpdate = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(80),
  phone: PhPhone.optional().or(z.literal('').transform(() => undefined)),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

export const AddressInput = z.object({
  label: optionalText(40),
  recipient: z.string().trim().min(2, 'Who receives the delivery?').max(80),
  phone: PhPhone,
  line1: z.string().trim().min(3, 'Enter the street, building or sitio').max(160),
  line2: optionalText(160),
  barangay: optionalText(80),
  city: z.string().trim().min(2, 'Enter the city or municipality').max(80),
  province: z.string().trim().min(2).max(80).default('Palawan'),
  postalCode: z.string().trim().regex(/^\d{4}$/, 'Four digits').optional().or(z.literal('').transform(() => undefined)),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof AddressInput>;

/** Deleting an account is irreversible, so the request must say so in words. */
export const DeleteAccountRequest = z.object({ confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }) });
