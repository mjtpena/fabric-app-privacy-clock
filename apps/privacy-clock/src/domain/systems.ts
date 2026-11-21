import { RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, normKey } from '@x10/shared/lib';

import { limits, type DataSystem, type Schema } from '../model';
import { requireOfficer } from './access';

export interface SystemInput {
  name: string;
  ownerSub: string;
  holds: string;
}

/** A privacy officer registers a system that holds personal data, with the person who acts on it. */
export async function addSystem(store: DataStore<Schema>, me: Person, x: SystemInput): Promise<DataSystem> {
  requireOfficer(me, 'add a system');
  const msg = checkText(x.name, { ...limits.systemName, label: 'Name' }) ?? checkText(x.holds, { ...limits.holds, optional: true, label: 'Holds' });
  if (msg) throw new RuleError(msg);
  const owner = (await store.repo('Person').list()).find((p) => p.sub === x.ownerSub);
  if (!owner) throw new RuleError('Choose the owner from the people who use this app.');
  const all = await store.repo('DataSystem').list();
  if (all.some((s) => normKey(s.name) === normKey(x.name))) throw new RuleError(`A system called ${x.name.trim()} already exists.`);
  return store.repo('DataSystem').create({
    name: x.name.trim(),
    ownerSub: owner.sub,
    ownerName: owner.displayName.slice(0, limits.ownerName.max),
    holds: x.holds.trim() || null,
    officerSub: me.sub,
  });
}
