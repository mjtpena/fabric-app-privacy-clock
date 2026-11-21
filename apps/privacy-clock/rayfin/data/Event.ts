import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * The logbook: one row per step on a request or breach. Append-only.
 *
 * Security: everyone reads; you can only create events stamped with your own sub; nobody can update or delete an
 * event, so the trail can be shown to a regulator as it was written.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.bySub),
})
export class Event {
  @uuid() id!: string;
  @set('request', 'breach') parentType!: 'request' | 'breach';
  @uuid() parentId!: string;
  @set('created', 'verified', 'status', 'extended', 'task_done', 'task_blocked', 'reassigned', 'decision', 'notified', 'closed', 'note')
  kind!:
    | 'created'
    | 'verified'
    | 'status'
    | 'extended'
    | 'task_done'
    | 'task_blocked'
    | 'reassigned'
    | 'decision'
    | 'notified'
    | 'closed'
    | 'note';
  @date() at!: Date;
  @text({ min: 1, max: 255 }) bySub!: string;
  @text({ min: 1, max: 600 }) text!: string;
}
