// Pure transforms from an authorised Firestore export (one JSON array per collection, documents as { id, ...fields })
// to the new data model. No I/O here: everything is unit-tested, and the loader only writes what these return.
// Field names come from the old admin's public code (docs/audit/admin-workflows.md); anything not recognised is
// reported, not guessed. Values the business must confirm are in MAPPINGS and printed in every report.

export type Doc = { id: string } & Record<string, unknown>;
export type Result<T> = { ok: true; value: T; dropped: string[] } | { ok: false; reason: string };

/** Assumptions to confirm with the business before a real run (also printed in the import report). */
export const MAPPINGS = {
  quotationStatus: { pending: 'NEW', new: 'NEW', contacted: 'CONTACTED', completed: 'WON', done: 'WON', cancelled: 'LOST', rejected: 'LOST' } as Record<string, string>,
  quotationService: { 'garden design': 'garden-design', 'garden-design': 'garden-design', landscaping: 'landscaping', 'garden maintenance': 'garden-maintenance', maintenance: 'garden-maintenance', 'garden-maintenance': 'garden-maintenance', 'garden essentials': 'garden-essentials', products: 'garden-essentials', plants: 'garden-essentials' } as Record<string, string>,
  employeeStatus: { active: 'ACTIVE', inactive: 'RESIGNED', 'on leave': 'ON_LEAVE', on_leave: 'ON_LEAVE' } as Record<string, string>,
  leaveStatus: { pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', declined: 'REJECTED', cancelled: 'CANCELLED' } as Record<string, string>,
  testimonialStatus: { pending: 'pending', approved: 'approved', rejected: 'rejected' } as Record<string, string>,
};
/** Never copied (D5: pay and government IDs; D6: clock-in photos; plus identity photos). Counted, never printed. */
export const EXCLUDED_FIELDS = ['dailyRate', 'foodAllowance', 'uniformBond', 'sss', 'philhealth', 'pagibig', 'salary', 'rate', 'deductions', 'paid', 'isPaid', 'paidLeave', 'timeInPhoto', 'timeOutPhoto', 'photo', 'photoUrl', 'userPhoto', 'passwordHash', 'salt'];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const lower = (v: unknown) => str(v).toLowerCase();
const droppedOf = (d: Doc) => Object.keys(d).filter((k) => EXCLUDED_FIELDS.includes(k));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Firestore timestamp in any export shape (ISO string, { seconds }, { _seconds }, epoch ms) → Date. */
export function parseWhen(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t);
  }
  if (typeof v === 'object') {
    const s = (v as Record<string, unknown>).seconds ?? (v as Record<string, unknown>)._seconds;
    if (typeof s === 'number') return new Date(s * 1000);
  }
  return null;
}
const ymdManila = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/** A time on a Manila work date: "08:05", "8:05 AM", "4:30 pm", or a full timestamp. */
export function timeOn(date: string, v: unknown): Date | null {
  const s = str(v);
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = m[3]?.toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || Number(m[2]) > 59) return null;
    return new Date(Date.parse(`${date}T${String(h).padStart(2, '0')}:${m[2]}:00Z`) - 8 * 3_600_000);
  }
  return parseWhen(v);
}

export interface AuthUser { uid: string; email: string; emailVerified: boolean; displayName: string | null; providers: string[]; disabled: boolean; createdAt: Date | null }
/** One user from `firebase auth:export --format=json`. Password hashes are ignored (the old site used Google sign-in only). */
export function authUser(u: Record<string, unknown>): Result<AuthUser> {
  const email = lower(u.email);
  if (!EMAIL.test(email)) return { ok: false, reason: 'no valid email' };
  const providers = Array.isArray(u.providerUserInfo) ? (u.providerUserInfo as { providerId?: string }[]).map((p) => str(p.providerId)).filter(Boolean) : [];
  return {
    ok: true,
    dropped: ['passwordHash', 'salt'].filter((k) => k in u),
    value: { uid: str(u.localId), email, emailVerified: u.emailVerified === true, displayName: str(u.displayName) || null, providers, disabled: u.disabled === true, createdAt: parseWhen(Number(u.createdAt) || u.createdAt) },
  };
}

export interface QuotationRow { legacyId: string; name: string; email: string; phone: string; services: string[]; projectLocation: string | null; preferredDate: Date | null; bestTimeToTalk: string | null; details: string; status: string; submittedAt: Date; uid: string | null; unmappedService: string | null }
export function quotation(d: Doc): Result<QuotationRow> {
  const email = lower(d.email);
  const name = str(d.name) || str(d.fullName);
  if (!name) return { ok: false, reason: 'no name' };
  if (!EMAIL.test(email)) return { ok: false, reason: 'no valid email' };
  const status = MAPPINGS.quotationStatus[lower(d.status)] ?? 'NEW';
  const rawServices = (Array.isArray(d.services) ? d.services : [d.service]).map(lower).filter(Boolean);
  const mapped = rawServices.map((s) => MAPPINGS.quotationService[s]);
  const unmapped = rawServices.filter((_, i) => !mapped[i]);
  const preferred = parseWhen(d.preferredDate);
  return {
    ok: true,
    dropped: droppedOf(d),
    value: {
      legacyId: d.id, name: name.slice(0, 80), email, phone: str(d.phone) || str(d.contactNumber), services: [...new Set(mapped.map((s) => s ?? 'other'))].slice(0, 5),
      projectLocation: str(d.projectLocation) || str(d.location) || null, preferredDate: preferred, bestTimeToTalk: str(d.bestTimeToTalk) || null,
      details: (str(d.message) || str(d.details) || '(no message in the old system)').slice(0, 3000), status,
      submittedAt: parseWhen(d.submittedAt) ?? parseWhen(d.createdAt) ?? new Date(0), uid: str(d.userId) || str(d.uid) || null, unmappedService: unmapped.join(', ') || null,
    },
  };
}

export interface EmployeeRow { legacyId: string; employeeNo: string; firstName: string; lastName: string; email: string | null; mobile: string | null; position: string | null; employmentStatus: string; hiredOn: Date | null }
export function employee(d: Doc): Result<EmployeeRow> {
  let first = str(d.firstName), last = str(d.lastName);
  if (!first && !last) {
    const parts = (str(d.name) || str(d.fullName)).split(/\s+/).filter(Boolean);
    if (!parts.length) return { ok: false, reason: 'no name' };
    last = parts.length > 1 ? parts.pop()! : '';
    first = parts.join(' ');
  }
  const email = lower(d.email);
  return {
    ok: true,
    dropped: droppedOf(d),
    value: {
      legacyId: d.id, employeeNo: (str(d.employeeNo) || str(d.employeeId) || `LEG-${d.id.slice(0, 8)}`).toUpperCase().replace(/[^A-Z0-9-]/g, '-').slice(0, 20),
      firstName: first.slice(0, 60), lastName: (last || '-').slice(0, 60), email: EMAIL.test(email) ? email : null, mobile: str(d.phone) || str(d.mobile) || null,
      position: str(d.designation) || str(d.position) || null, employmentStatus: MAPPINGS.employeeStatus[lower(d.status)] ?? 'ACTIVE', hiredOn: parseWhen(d.dateHired) ?? parseWhen(d.hiredOn),
    },
  };
}

export interface TimeLogRow { legacyId: string; employeeLegacyId: string; workDate: string; punches: { type: 'IN' | 'OUT'; at: Date }[] }
/** The old system kept up to four times a day: morning in/out, afternoon in/out. */
export function timeLog(d: Doc): Result<TimeLogRow> {
  const emp = str(d.employeeId) || str(d.employee);
  if (!emp) return { ok: false, reason: 'no employee' };
  const when = parseWhen(d.date) ?? parseWhen(d.createdAt);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(d.date)) ? str(d.date) : when ? ymdManila(when) : '';
  if (!date) return { ok: false, reason: 'no date' };
  const punches: { type: 'IN' | 'OUT'; at: Date }[] = [];
  for (const [k, type] of [['morningIn', 'IN'], ['morningOut', 'OUT'], ['afternoonIn', 'IN'], ['afternoonOut', 'OUT'], ['timeIn', 'IN'], ['timeOut', 'OUT']] as const) {
    if (d[k] == null || d[k] === '') continue;
    const at = timeOn(date, d[k]);
    if (!at) return { ok: false, reason: `unreadable ${k}` };
    punches.push({ type, at });
  }
  if (!punches.length) return { ok: false, reason: 'no times' };
  punches.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { ok: true, dropped: droppedOf(d), value: { legacyId: d.id, employeeLegacyId: emp, workDate: date, punches } };
}

export interface LeaveRow { legacyId: string; employeeLegacyId: string; leaveType: string; startDate: string; endDate: string; reason: string | null; status: string; createdAt: Date }
export function leave(d: Doc): Result<LeaveRow> {
  const emp = str(d.employeeId) || str(d.employee);
  if (!emp) return { ok: false, reason: 'no employee' };
  const s = parseWhen(d.startDate), e = parseWhen(d.endDate) ?? s;
  if (!s || !e) return { ok: false, reason: 'no dates' };
  const start = ymdManila(s), end = ymdManila(e);
  if (end < start) return { ok: false, reason: 'end before start' };
  if (start.slice(0, 4) !== end.slice(0, 4)) return { ok: false, reason: 'crosses a year (split it by hand)' };
  return {
    ok: true,
    dropped: droppedOf(d),
    value: { legacyId: d.id, employeeLegacyId: emp, leaveType: str(d.leaveType) || str(d.type) || 'Leave', startDate: start, endDate: end, reason: str(d.reason) || null, status: MAPPINGS.leaveStatus[lower(d.status)] ?? 'PENDING', createdAt: parseWhen(d.createdAt) ?? s },
  };
}

export interface TestimonialRow { legacyId: string; name: string; role?: string; projectType?: string; rating: number; text: string; status: string; uid: string | null; createdAt: Date }
export function testimonial(d: Doc): Result<TestimonialRow> {
  const text = str(d.text) || str(d.message) || str(d.feedback);
  const name = str(d.name) || str(d.userName);
  if (!text || !name) return { ok: false, reason: 'no text or name' };
  const rating = Math.round(Number(d.rating));
  return {
    ok: true,
    dropped: droppedOf(d).concat(['email', 'userEmail'].filter((k) => k in d)),
    value: { legacyId: d.id, name: name.slice(0, 80), ...(str(d.role) ? { role: str(d.role).slice(0, 80) } : {}), ...(str(d.projectType) ? { projectType: str(d.projectType).slice(0, 60) } : {}), rating: rating >= 1 && rating <= 5 ? rating : 5, text: text.slice(0, 2000), status: MAPPINGS.testimonialStatus[lower(d.status)] ?? 'pending', uid: str(d.userId) || null, createdAt: parseWhen(d.createdAt) ?? new Date(0) },
  };
}

export interface MessageRow { legacyId: string; conversationLegacyId: string; senderUid: string | null; fromStaff: boolean; body: string; at: Date; read: boolean }
export function message(d: Doc): Result<MessageRow> {
  const conv = str(d.conversationId);
  const body = str(d.text) || str(d.message) || str(d.body);
  if (!conv) return { ok: false, reason: 'no conversation' };
  if (!body) return { ok: false, reason: 'empty message' };
  const sender = str(d.senderId) || str(d.uid) || null;
  const fromStaff = d.isAdmin === true || lower(d.sender) === 'admin' || lower(d.senderType) === 'admin';
  return { ok: true, dropped: droppedOf(d), value: { legacyId: d.id, conversationLegacyId: conv, senderUid: sender, fromStaff, body: body.slice(0, 4000), at: parseWhen(d.timestamp) ?? parseWhen(d.createdAt) ?? new Date(0), read: d.read === true } };
}
