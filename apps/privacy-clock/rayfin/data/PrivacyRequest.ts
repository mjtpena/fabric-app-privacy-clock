import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A data subject request (GDPR Art. 12 and 15 to 21) and its legal clock.
 *
 * Security (README "Security model"):
 * - read: every signed-in user.
 * - create: only as the owning privacy officer (ownerSub = caller) and only in status "new", with no extension or
 *   closing fields. That the caller is a privacy officer (Person.isAdmin) is checked in src/domain/requests.ts.
 * - update: only the owning privacy officer. The facts the clock is computed from (ref, type, receivedAt, dueAt)
 *   and the owner are frozen after create, so nobody can move a deadline by editing the row.
 * - delete: nobody (the trail must stay complete).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.ownerSub).and(item.status.eq('new')),
  exclude: ['extendedDueAt', 'extensionReason', 'extensionNotifiedAt', 'outcome', 'closedAt'],
})
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.ownerSub),
  exclude: ['ref', 'type', 'receivedAt', 'dueAt', 'ownerSub'],
})
export class PrivacyRequest {
  @uuid() id!: string;
  @text({ min: 3, max: 12 }) ref!: string;
  @set('access', 'erasure', 'rectification', 'portability', 'objection', 'restriction')
  type!: 'access' | 'erasure' | 'rectification' | 'portability' | 'objection' | 'restriction';
  @text({ min: 2, max: 120 }) subjectLabel!: string;
  @set('email', 'web_form', 'letter', 'phone') channel!: 'email' | 'web_form' | 'letter' | 'phone';
  @date() receivedAt!: Date;
  @date({ optional: true }) identityVerifiedAt?: Date;
  @date() dueAt!: Date;
  @date({ optional: true }) extendedDueAt?: Date;
  @text({ max: 400, optional: true }) extensionReason?: string;
  @date({ optional: true }) extensionNotifiedAt?: Date;
  @set('new', 'verifying', 'in_progress', 'ready', 'closed', 'refused')
  status!: 'new' | 'verifying' | 'in_progress' | 'ready' | 'closed' | 'refused';
  @text({ max: 600, optional: true }) outcome?: string;
  @date({ optional: true }) closedAt?: Date;
  @text({ min: 1, max: 255 }) ownerSub!: string;
}
