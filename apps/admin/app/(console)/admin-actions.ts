'use server';
// Console actions for messages, users and settings. The API checks messages.reply, roles.manage(_super),
// users.manage and settings.manage, and audits.
import { api, attempt } from '@greenscape/auth/api';
import { ProvisionAccountBody, ProvisionedAccount, z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';

const Any = z.any();
const Id = z.string().uuid();
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export async function createStaffAccount(input: unknown) {
  return attempt(async () => {
    const out = await api('/v1/users', ProvisionedAccount, json('POST', ProvisionAccountBody.parse(input)));
    revalidatePath('/users');
    return out;
  });
}

export async function replyConversation(id: string, body: string) {
  return attempt(async () => {
    const out = await api(`/v1/admin/conversations/${Id.parse(id)}/messages`, Any, json('POST', { body }));
    revalidatePath('/messages');
    return out;
  });
}
export async function setConversationStatus(id: string, status: 'open' | 'closed') {
  return attempt(async () => {
    const out = await api(`/v1/admin/conversations/${Id.parse(id)}`, Any, json('PATCH', { status }));
    revalidatePath('/messages');
    return out;
  });
}
export async function replyInquiry(id: string, body: string) {
  return attempt(async () => {
    const out = await api(`/v1/admin/inquiries/${Id.parse(id)}/reply`, Any, json('POST', { body }));
    revalidatePath('/messages/contact');
    return out as { emailed: boolean };
  });
}
export async function setInquiryStatus(id: string, status: 'new' | 'replied' | 'closed') {
  return attempt(async () => {
    const out = await api(`/v1/admin/inquiries/${Id.parse(id)}`, Any, json('PATCH', { status }));
    revalidatePath('/messages/contact');
    return out;
  });
}
export async function setUserRoles(id: string, roles: string[]) {
  return attempt(async () => {
    const out = await api(`/v1/users/${Id.parse(id)}/roles`, Any, json('PUT', { roles }));
    revalidatePath('/users');
    return out;
  });
}
export async function setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
  return attempt(async () => {
    const out = await api(`/v1/users/${Id.parse(id)}/status`, Any, json('PATCH', { status }));
    revalidatePath('/users');
    return out;
  });
}
export async function saveNotifications(input: unknown) {
  return attempt(async () => {
    const out = await api('/v1/admin/settings/notifications', Any, json('PUT', input));
    revalidatePath('/settings');
    return out;
  });
}
