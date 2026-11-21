import { entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * A system that holds personal data, and the person who searches, exports or erases data in it.
 *
 * Security: everyone reads; a privacy officer creates and maintains systems as themselves (officerSub = caller;
 * that the caller is an officer is checked in the domain); nobody deletes (tasks keep pointing at them).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update'], {
  policy: (claims, item) => claims.sub.eq(item.officerSub),
})
export class DataSystem {
  @uuid() id!: string;
  @text({ min: 3, max: 80 }) name!: string;
  @text({ min: 1, max: 255 }) ownerSub!: string;
  @text({ min: 1, max: 100 }) ownerName!: string;
  @text({ max: 300, optional: true }) holds?: string;
  @text({ min: 1, max: 255 }) officerSub!: string;
}
