// Loads an authorised Firestore export into the new system. Dry run by default (reads, transforms, counts, checksums,
// writes nothing); apply = idempotent writes keyed on legacy ids, in dependency order. Never touches Firebase.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { collections, type MongoDb } from '@greenscape/content';
import type { Db } from '@greenscape/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureBalances, recompute, toDate, workWeekdays } from '../../../apps/api/src/modules/attendance/service.ts';
import { leaveDays } from '../../../apps/api/src/modules/attendance/time.ts';
import { EXCLUDED_FIELDS, MAPPINGS, authUser, employee, leave, message, parseWhen, quotation, testimonial, timeLog, type Doc, type Result } from './transform.ts';

export const SYSTEM_USER = '00000000-0000-4000-8000-000000000000';
/** Files an export directory may contain (each optional). */
export const FILES = {
  users: 'auth-users.json', quotations: 'quotations.json', conversations: 'conversations.json', messages: 'conversations.messages.json',
  employees: 'employees.json', timeLogs: 'timeLogs.json', leaveRequests: 'leaveRequests.json', testimonials: 'testimonials.json', announcements: 'announcements.json',
} as const;
type Key = keyof typeof FILES;
export interface Section { file: string; provided: boolean; sha256: string | null; input: number; valid: number; created: number; existing: number; rejected: { id: string; reason: string }[]; excludedFields: Record<string, number>; notes: string[] }
export interface Report { mode: 'dry-run' | 'apply'; dir: string; at: string; mappings: typeof MAPPINGS; excludedFieldNames: string[]; sections: Record<Key, Section> }

export async function runImport(opts: { dir: string; apply: boolean; db: Db; mongo: MongoDb; supabase: SupabaseClient; log?: (s: string) => void }): Promise<Report> {
  const { dir, apply, db, mongo, supabase } = opts;
  const log = opts.log ?? (() => {});
  const sections = {} as Record<Key, Section>;
  const read = (key: Key): unknown[] => {
    const file = path.join(dir, FILES[key]);
    const s: Section = { file: FILES[key], provided: fs.existsSync(file), sha256: null, input: 0, valid: 0, created: 0, existing: 0, rejected: [], excludedFields: {}, notes: [] };
    sections[key] = s;
    if (!s.provided) return [];
    const bytes = fs.readFileSync(file);
    s.sha256 = createHash('sha256').update(bytes).digest('hex');
    const json = JSON.parse(bytes.toString('utf8'));
    const rows = Array.isArray(json) ? json : Array.isArray(json?.users) ? json.users : [];
    s.input = rows.length;
    return rows;
  };
  /** Runs a transform over every row, recording rejects and dropped-field counts (names only, never values). */
  const each = <T>(key: Key, rows: unknown[], fn: (d: Doc) => Result<T>) => {
    const s = sections[key];
    const out: T[] = [];
    for (const r of rows) {
      const d = r as Doc;
      const res = fn(d);
      if (!res.ok) { s.rejected.push({ id: String(d.id ?? d.localId ?? '?'), reason: res.reason }); continue; }
      for (const f of res.dropped) s.excludedFields[f] = (s.excludedFields[f] ?? 0) + 1;
      out.push(res.value);
    }
    s.valid = out.length;
    return out;
  };

  // ── users (Firebase Auth export) ──
  const users = each('users', read('users'), (d) => authUser(d));
  const uidToUser = new Map<string, string>();
  const customerRole = await db.role.findUnique({ where: { key: 'customer' } });
  for (const u of users) {
    const byUid = u.uid ? await db.user.findUnique({ where: { legacyUid: u.uid } }) : null;
    const byEmail = byUid ?? (await db.user.findFirst({ where: { email: { equals: u.email, mode: 'insensitive' } } }));
    if (byEmail) {
      sections.users.existing++;
      uidToUser.set(u.uid, byEmail.id);
      if (apply && !byEmail.legacyUid && u.uid) await db.user.update({ where: { id: byEmail.id }, data: { legacyUid: u.uid } });
      continue;
    }
    sections.users.created++;
    if (!apply) { uidToUser.set(u.uid, `dry:${u.uid}`); continue; } // so a dry run counts their chats and quotes too
    const { data, error } = await supabase.auth.admin.createUser({ email: u.email, email_confirm: u.emailVerified, user_metadata: u.displayName ? { full_name: u.displayName } : {} });
    if (error || !data.user) { sections.users.created--; sections.users.notes.push(`${u.email.replace(/^(.).*@/, '$1…@')}: ${error?.message ?? 'not created'} (links on first sign-in)`); continue; }
    const row = await db.user.create({ data: { authUserId: data.user.id, email: u.email, displayName: u.displayName, legacyUid: u.uid || null, status: u.disabled ? 'SUSPENDED' : 'ACTIVE', ...(customerRole ? { roles: { create: { roleId: customerRole.id } } } : {}), createdAt: u.createdAt ?? undefined } });
    uidToUser.set(u.uid, row.id);
  }
  if (users.length) sections.users.notes.push('No passwords are imported: people sign in with Google (as before) or set a password with "Forgot password".');
  const userFor = async (uid: string | null) => (uid ? (uidToUser.get(uid) ?? (await db.user.findUnique({ where: { legacyUid: uid }, select: { id: true } }))?.id ?? null) : null);

  // ── quotations ──
  const quotes = each('quotations', read('quotations'), quotation);
  const unmapped = new Set<string>();
  for (const q of quotes) {
    if (q.unmappedService) unmapped.add(q.unmappedService);
    if (await db.quotation.findUnique({ where: { legacyId: q.legacyId }, select: { id: true } })) { sections.quotations.existing++; continue; }
    sections.quotations.created++;
    if (!apply) continue;
    const userId = await userFor(q.uid);
    await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('quotation_number_seq') AS n`;
      const year = new Date(q.submittedAt.getTime() + 8 * 3_600_000).getUTCFullYear();
      const customer = userId ? await tx.customer.upsert({ where: { userId }, create: { userId, email: q.email, name: q.name, phone: q.phone || null }, update: {} }) : null;
      await tx.quotation.create({ data: { number: `Q-${year}-${String(row!.n).padStart(6, '0')}`, legacyId: q.legacyId, customerId: customer?.id, name: q.name, email: q.email, phone: q.phone, services: q.services, projectLocation: q.projectLocation, preferredDate: q.preferredDate, bestTimeToTalk: q.bestTimeToTalk, details: q.details, status: q.status as never, submittedAt: q.submittedAt } });
    });
  }
  if (unmapped.size) sections.quotations.notes.push(`Services not recognised (saved as "Something else", confirm the mapping): ${[...unmapped].join('; ')}`);

  // ── conversations + messages ──
  const convRows = read('conversations') as Doc[];
  const msgs = each('messages', read('messages'), message);
  sections.conversations.valid = convRows.length;
  for (const c of convRows) {
    const uid = String(c.userId ?? c.uid ?? c.customerId ?? '');
    if (await db.conversation.findUnique({ where: { legacyId: String(c.id) }, select: { id: true } })) { sections.conversations.existing++; continue; }
    const customerUserId = await userFor(uid);
    if (!customerUserId) { sections.conversations.rejected.push({ id: String(c.id), reason: 'customer not in the users export' }); continue; }
    const mine = msgs.filter((m) => m.conversationLegacyId === String(c.id)).sort((a, b) => a.at.getTime() - b.at.getTime());
    sections.conversations.created++;
    sections.messages.created += mine.length;
    if (!apply) continue;
    await db.conversation.create({
      data: {
        legacyId: String(c.id), customerUserId, status: String(c.status ?? 'open') === 'closed' ? 'closed' : 'open', lastMessageAt: mine.at(-1)?.at ?? parseWhen(c.updatedAt) ?? null,
        unreadForStaff: mine.filter((m) => !m.fromStaff && !m.read).length,
        messages: { create: mine.map((m) => ({ senderUserId: m.fromStaff ? SYSTEM_USER : customerUserId, body: m.body, createdAt: m.at, readAt: m.read ? m.at : null })) },
      },
    });
  }
  sections.conversations.valid = sections.conversations.created + sections.conversations.existing;

  // ── employees ──
  const emps = each('employees', read('employees'), employee);
  const employeeRole = await db.role.findUnique({ where: { key: 'employee' } });
  const empId = new Map<string, string>();
  for (const e of emps) {
    const found = await db.employee.findUnique({ where: { legacyId: e.legacyId }, select: { id: true } });
    if (found) { sections.employees.existing++; empId.set(e.legacyId, found.id); continue; }
    sections.employees.created++;
    if (!apply) { empId.set(e.legacyId, `dry:${e.legacyId}`); continue; }
    const user = e.email ? await db.user.findFirst({ where: { email: { equals: e.email, mode: 'insensitive' } }, select: { id: true } }) : null;
    const linked = user && !(await db.employee.findUnique({ where: { userId: user.id } })) ? user.id : null;
    let no = e.employeeNo;
    for (let n = 2; await db.employee.findUnique({ where: { employeeNo: no } }); n++) no = `${e.employeeNo.slice(0, 17)}-${n}`;
    const row = await db.employee.create({ data: { legacyId: e.legacyId, employeeNo: no, firstName: e.firstName, lastName: e.lastName, email: e.email, mobile: e.mobile, position: e.position, employmentStatus: e.employmentStatus as never, hiredOn: e.hiredOn, userId: linked } });
    if (linked && employeeRole) await db.userRole.createMany({ data: [{ userId: linked, roleId: employeeRole.id }], skipDuplicates: true });
    empId.set(e.legacyId, row.id);
  }
  const employeeFor = async (legacy: string) => empId.get(legacy) ?? (await db.employee.findUnique({ where: { legacyId: legacy }, select: { id: true } }))?.id ?? null;

  // ── time logs → attendance ──
  const logs = each('timeLogs', read('timeLogs'), timeLog);
  for (const t of logs) {
    const employeeId = await employeeFor(t.employeeLegacyId);
    if (!employeeId) { sections.timeLogs.rejected.push({ id: t.legacyId, reason: 'employee not in the export' }); sections.timeLogs.valid--; continue; }
    if (!employeeId.startsWith('dry:') && (await db.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: toDate(t.workDate) } }, select: { id: true } }))) { sections.timeLogs.existing++; continue; }
    sections.timeLogs.created++;
    if (!apply) continue;
    await db.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.create({ data: { employeeId, workDate: toDate(t.workDate), status: 'OPEN', punches: { create: t.punches.map((p) => ({ type: p.type, at: p.at, source: 'import' })) } } });
      await recompute(tx, rec.id, { now: new Date() });
    });
  }

  // ── leave ──
  const leaves = each('leaveRequests', read('leaveRequests'), leave);
  const typeIds = new Map<string, string>();
  for (const l of leaves) {
    const employeeId = await employeeFor(l.employeeLegacyId);
    if (!employeeId) { sections.leaveRequests.rejected.push({ id: l.legacyId, reason: 'employee not in the export' }); sections.leaveRequests.valid--; continue; }
    if (await db.leaveRequest.findUnique({ where: { legacyId: l.legacyId }, select: { id: true } })) { sections.leaveRequests.existing++; continue; }
    sections.leaveRequests.created++;
    if (!apply) continue;
    const typeName = l.leaveType.trim();
    let typeId = typeIds.get(typeName.toLowerCase());
    if (!typeId) {
      const t = (await db.leaveType.findFirst({ where: { name: { equals: typeName, mode: 'insensitive' } } })) ?? (await db.leaveType.findFirst({ where: { key: typeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'leave' } }));
      typeId = t?.id ?? (await db.leaveType.create({ data: { key: `imported_${typeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'leave'}`, name: typeName.slice(0, 60), defaultDaysPerYear: 0 } })).id;
      if (!t) sections.leaveRequests.notes.push(`Created leave type "${typeName}" with 0 days a year: set its allowance.`);
      typeIds.set(typeName.toLowerCase(), typeId);
    }
    const days = leaveDays(l.startDate, l.endDate, await workWeekdays(db, employeeId, l.startDate), new Set()) || 1;
    await db.$transaction(async (tx) => {
      await tx.leaveRequest.create({ data: { legacyId: l.legacyId, employeeId, leaveTypeId: typeId!, startDate: toDate(l.startDate), endDate: toDate(l.endDate), days, reason: l.reason, status: l.status as never, createdAt: l.createdAt, ...(l.status !== 'PENDING' ? { decidedAt: l.createdAt, decisionNote: 'Decided in the old system' } : {}) } });
      if (l.status === 'APPROVED') {
        const year = Number(l.startDate.slice(0, 4));
        await ensureBalances(tx, employeeId, year);
        await tx.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: typeId!, year } }, data: { used: { increment: days } } });
      }
    });
  }

  // ── feedback (all statuses; Phase 6 already holds the approved ones, matched by text and date) ──
  const tcoll = mongo.collection(collections.testimonials);
  for (const t of each('testimonials', read('testimonials'), testimonial)) {
    if (await tcoll.findOne({ legacyId: t.legacyId })) { sections.testimonials.existing++; continue; }
    const same = await tcoll.findOne({ text: t.text });
    if (same) {
      sections.testimonials.existing++;
      if (apply) await tcoll.updateOne({ _id: same._id }, { $set: { legacyId: t.legacyId } });
      continue;
    }
    sections.testimonials.created++;
    if (!apply) continue;
    const userId = await userFor(t.uid);
    const { uid: _u, legacyId, ...rest } = t;
    await tcoll.insertOne({ ...rest, ...(userId ? { userId } : {}), legacyId, imported: true });
  }

  // ── announcements ──
  const anns = read('announcements') as Doc[];
  for (const a of anns) {
    const title = String(a.title ?? '').trim(), body = String(a.message ?? a.body ?? a.content ?? '').trim();
    if (!title && !body) { sections.announcements.rejected.push({ id: String(a.id), reason: 'empty' }); continue; }
    sections.announcements.valid++;
    if (await db.announcement.findUnique({ where: { legacyId: String(a.id) } })) { sections.announcements.existing++; continue; }
    sections.announcements.created++;
    if (apply) await db.announcement.create({ data: { legacyId: String(a.id), title: (title || body.slice(0, 60)).slice(0, 120), body, priority: String(a.priority ?? 'normal'), expiresAt: parseWhen(a.expiresAt), createdById: SYSTEM_USER, createdAt: parseWhen(a.createdAt) ?? new Date(0) } });
  }

  log('done');
  return { mode: apply ? 'apply' : 'dry-run', dir, at: new Date().toISOString(), mappings: MAPPINGS, excludedFieldNames: EXCLUDED_FIELDS, sections };
}

/** The report as Markdown: counts, checksums, rejects (by id and reason), excluded fields (names and counts only). */
export function reportMarkdown(r: Report) {
  const rows = Object.entries(r.sections).map(([k, s]) => `| ${k} | ${s.provided ? 'yes' : 'no'} | ${s.input} | ${s.valid} | ${s.created} | ${s.existing} | ${s.rejected.length} | ${s.sha256 ? `\`${s.sha256.slice(0, 16)}…\`` : ''} |`);
  const excluded = Object.entries(r.sections).flatMap(([k, s]) => Object.entries(s.excludedFields).map(([f, n]) => `- ${k}: \`${f}\` dropped on ${n} record${n === 1 ? '' : 's'}`));
  const notes = Object.entries(r.sections).flatMap(([k, s]) => s.notes.map((n) => `- ${k}: ${n}`));
  const rejects = Object.entries(r.sections).flatMap(([k, s]) => s.rejected.slice(0, 50).map((x) => `- ${k} \`${x.id}\`: ${x.reason}`));
  return [
    `# Data import report (${r.mode})`, '',
    `Generated ${r.at} from \`${r.dir}\`. ${r.mode === 'dry-run' ? 'Dry run: nothing was written.' : 'Applied. Re-running skips everything already imported.'}`, '',
    `| Data | File given | In file | Valid | ${r.mode === 'apply' ? 'Created' : 'Would create'} | Already here | Rejected | SHA-256 of file |`,
    '|---|---|---:|---:|---:|---:|---:|---|', ...rows, '',
    '## Not copied on purpose', excluded.length ? excluded.join('\n') : '- Nothing in this export matched the excluded fields.', '',
    '## Needs a person', notes.length ? notes.join('\n') : '- Nothing.', '',
    '## Rejected records', rejects.length ? rejects.join('\n') : '- None.', '',
    '## Mappings to confirm', '```json', JSON.stringify(r.mappings, null, 2), '```', '',
  ].join('\n');
}

