import { date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A personal data breach (GDPR Art. 33 and 34) and its 72-hour clock.
 *
 * Security (README "Security model"):
 * - read: every signed-in user.
 * - create: anyone signed in can report, but only as themselves (reportedBy = caller), only in status "open" with
 *   decision "pending", and without any assessment or notification fields.
 * - update: only the privacy officer handling the case (officerSub, set by the app to a privacy officer when the
 *   case is reported). Who reported it, the reference and the handling officer are frozen after create.
 * - delete: nobody (Art. 33(5): every breach stays documented).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.reportedBy).and(item.status.eq('open')).and(item.decision.eq('pending')),
  exclude: [
    'riskLevel',
    'riskRationale',
    'authorityNotifiedAt',
    'authorityRef',
    'subjectsNotifiedAt',
    'delayReason',
    'decisionBy',
    'containedAt',
    'closedAt',
  ],
})
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.officerSub),
  exclude: ['ref', 'reportedBy', 'officerSub'],
})
export class BreachCase {
  @uuid() id!: string;
  @text({ min: 3, max: 12 }) ref!: string;
  @text({ min: 3, max: 120 }) title!: string;
  @date() awareAt!: Date;
  @text({ min: 1, max: 255 }) reportedBy!: string;
  @text({ min: 1, max: 255 }) officerSub!: string;
  @text({ max: 200, optional: true }) categories?: string;
  @int() approxSubjects!: number;
  @int() approxRecords!: number;
  @set({ enum: ['unlikely', 'risk', 'high_risk'], optional: true }) riskLevel?: 'unlikely' | 'risk' | 'high_risk';
  @text({ max: 1000, optional: true }) riskRationale?: string;
  @date({ optional: true }) authorityNotifiedAt?: Date;
  @text({ max: 60, optional: true }) authorityRef?: string;
  @date({ optional: true }) subjectsNotifiedAt?: Date;
  @text({ max: 600, optional: true }) delayReason?: string;
  @set('pending', 'notify_authority', 'notify_both', 'document_only')
  decision!: 'pending' | 'notify_authority' | 'notify_both' | 'document_only';
  @text({ max: 255, optional: true }) decisionBy?: string;
  @set('open', 'contained', 'closed') status!: 'open' | 'contained' | 'closed';
  @date({ optional: true }) containedAt?: Date;
  @date({ optional: true }) closedAt?: Date;
}
