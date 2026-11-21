import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * One step on one system for a request or breach (search, export, erase, contain…), assigned to a person.
 *
 * Security: everyone reads. Only the privacy officer handling the parent creates tasks (officerSub = caller,
 * denormalised from the parent), and only as open. Updates: the assignee (status and note) or that officer
 * (reassign, due date); the parent link, the action and the officer are frozen. Which of the remaining fields each
 * of the two may change is checked in the domain, because one update policy covers both. Nobody deletes.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.officerSub).and(item.status.eq('open')),
  exclude: ['doneAt'],
})
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.assigneeSub).or(claims.sub.eq(item.officerSub)),
  exclude: ['parentType', 'parentId', 'officerSub', 'action'],
})
export class Task {
  @uuid() id!: string;
  @set('request', 'breach') parentType!: 'request' | 'breach';
  @uuid() parentId!: string;
  @uuid({ optional: true }) systemId?: string;
  @set('search', 'export', 'erase', 'rectify', 'restrict', 'contain', 'other')
  action!: 'search' | 'export' | 'erase' | 'rectify' | 'restrict' | 'contain' | 'other';
  @text({ min: 3, max: 150 }) title!: string;
  @text({ min: 1, max: 255 }) assigneeSub!: string;
  @text({ min: 1, max: 255 }) officerSub!: string;
  @set('open', 'done', 'blocked') status!: 'open' | 'done' | 'blocked';
  @text({ max: 600, optional: true }) note?: string;
  @date() dueAt!: Date;
  @date({ optional: true }) doneAt?: Date;
}
