/**
 * The logbook (rule 5): every status change writes an Event. Events are append-only: this module only creates them,
 * and the Event entity has no update or delete permission for anyone.
 */
import { RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import { limits, type EventKind, type LogEvent, type ParentType, type Schema } from '../model';

export interface EventParent {
  type: ParentType;
  id: string;
}

/** Trim and cap text at the column limit so a long note never fails the write. */
export function eventText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) throw new RuleError('An event needs some text.');
  return t.length > limits.eventText.max ? `${t.slice(0, limits.eventText.max - 1)}…` : t;
}

export async function logEvent(
  store: DataStore<Schema>,
  me: Person,
  parent: EventParent,
  kind: EventKind,
  text: string,
  at: Date | string = new Date(),
): Promise<LogEvent> {
  return store.repo('Event').create({
    parentType: parent.type,
    parentId: parent.id,
    kind,
    at: typeof at === 'string' ? at : at.toISOString(),
    bySub: me.sub,
    text: eventText(text),
  });
}
