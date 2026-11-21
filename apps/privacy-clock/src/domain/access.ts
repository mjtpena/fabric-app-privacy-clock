/**
 * Who may do what. Privacy officers are the people the deployer marks as admins (Person.isAdmin). These checks run
 * in demo mode and in Fabric; the row policies on the entities back them up where the policy DSL can express it.
 */
import { PermissionError } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import type { BreachCase, DataSystem, PrivacyRequest, Task } from '../model';

export function isOfficer(me: Pick<Person, 'isAdmin'>): boolean {
  return me.isAdmin === true;
}

export function requireOfficer(me: Person, what = 'do this'): void {
  if (!isOfficer(me)) throw new PermissionError(`Only a privacy officer can ${what}.`);
}

export function requireRequestOfficer(me: Person, r: PrivacyRequest): void {
  requireOfficer(me, 'change a request');
  if (r.ownerSub !== me.sub) throw new PermissionError(`${r.ref} belongs to another privacy officer; only they can change it.`);
}

export function requireBreachOfficer(me: Person, b: BreachCase): void {
  requireOfficer(me, 'assess or close a breach');
  if (b.officerSub !== me.sub) throw new PermissionError(`${b.ref} is handled by another privacy officer; only they can change it.`);
}

/** The assignee records progress on a task (status and note). */
export function requireAssignee(me: Person, t: Task): void {
  if (t.assigneeSub !== me.sub) throw new PermissionError('Only the person the task is assigned to can update it.');
}

/** The officer who created a task can reassign it or change its due date. */
export function requireTaskOfficer(me: Person, t: Task): void {
  requireOfficer(me, 'reassign a task');
  if (t.officerSub !== me.sub) throw new PermissionError('Only the privacy officer handling this item can reassign its tasks.');
}

export function requireSystemOfficer(me: Person, s: DataSystem): void {
  requireOfficer(me, 'change a system');
  if (s.officerSub !== me.sub) throw new PermissionError('Only the privacy officer who maintains this system can change it.');
}
