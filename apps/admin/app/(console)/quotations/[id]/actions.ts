'use server';
import { api } from '@greenscape/auth/api';
import { QUOTATION_STATUSES, z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';

// Server actions call the API with the staff member's own token; the API enforces quotations.manage and audits.
const Ok = z.object({}).passthrough();

export async function setStatus(id: string, formData: FormData) {
  const status = z.enum(QUOTATION_STATUSES).parse(formData.get('status'));
  await api(`/v1/quotations/${id}`, Ok, { method: 'PATCH', body: JSON.stringify({ status }) });
  revalidatePath(`/quotations/${id}`);
  revalidatePath('/quotations');
}

export async function addNote(id: string, formData: FormData) {
  const body = z.string().trim().min(1).max(4000).parse(formData.get('body'));
  await api(`/v1/quotations/${id}/notes`, Ok, { method: 'POST', body: JSON.stringify({ body }) });
  revalidatePath(`/quotations/${id}`);
}
