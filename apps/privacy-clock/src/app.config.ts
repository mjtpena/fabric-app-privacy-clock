/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/**
 * Demo personas. Alex is the privacy officer (admin). Sam, Priya and Chen own the systems that hold personal data
 * and get the search, export and erase tasks. Noor is staff with no system, who can still report a breach.
 */
export const personas: Persona[] = [
  { sub: 'demo-officer-alex', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Privacy officer' },
  { sub: 'demo-owner-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Owner: CRM, Support desk' },
  { sub: 'demo-owner-priya', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'Owner: HR suite, Payroll' },
  { sub: 'demo-owner-chen', name: 'Chen Wei', email: 'chen@example.com', isAdmin: false, role: 'Owner: Data lake, Marketing' },
  { sub: 'demo-staff-noor', name: 'Noor Haddad', email: 'noor@example.com', isAdmin: false, role: 'Staff' },
];

export const PERSONA = {
  alex: personas[0].sub,
  sam: personas[1].sub,
  priya: personas[2].sub,
  chen: personas[3].sub,
  noor: personas[4].sub,
} as const;

export const config: AppConfig<Schema> = {
  appId: 'privacy-clock',
  title: 'Privacy Clock',
  tagline: 'Every privacy request and breach with its legal clock running, every step recorded.',
  defs,
  personas,
  seed,
  accent: 'magenta',
  // A clock face whose hand has swept a third of the dial, under a tower's pointed roof (JSX-free for the seed tools).
  logoPaths: ['M5 10.5 12 3l7 7.5', 'M12 9.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z', 'M12 15.5V12.6', 'M12 15.5l2.4 1.4'],
  // Phone tab-bar icons are attached in main.tsx (navIcons) to keep this file JSX-free.
  nav: [
    { to: '/', label: 'Tower', end: true },
    { to: '/intake', label: 'Intake' },
    { to: '/gears', label: 'Gears' },
    { to: '/escapement', label: 'Escapement' },
    { to: '/logbook', label: 'Logbook' },
    { to: '/almanac', label: 'Almanac' },
    { to: '/about', label: 'About' },
  ],
};
