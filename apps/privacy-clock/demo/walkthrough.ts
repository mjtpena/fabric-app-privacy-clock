import type { DemoScript } from '@x10/shared/demo';

const ALEX = 'demo-officer-alex';
const SAM = 'demo-owner-sam';

export const script: DemoScript = {
  title: 'Privacy Clock: every privacy request and breach on its legal clock',
  persona: ALEX,
  scenes: [
    {
      id: 'hook',
      say: [
        'Privacy requests and breaches have legal deadlines, and most teams find out about them from a shared inbox when they have already passed.',
        'Here every open request and breach is a clock on one tower: the round dials are requests, the two hexagons in the belfry are breaches.',
        'The sweep is the share of the legal time already used; overdue dials crack and their hands tick red.',
      ],
      async run(h) {
        await h.goto('/', ALEX);
        await h.pause(4000);
        await h.hover(h.page.locator('[data-testid="breach-dial"][data-ref="BR-0004"]'));
        await h.pause(3500);
        await h.hover(h.page.locator('[data-testid="request-dial"][data-ref="DSR-0133"]'));
        await h.pause(3500);
      },
    },
    {
      id: 'lens',
      say: ['Switch the lens to type and the floors regroup by access, erasure and the other rights.'],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: /Type/ }));
        await h.pause(3500);
      },
    },
    {
      id: 'today',
      say: ['Today ranks what needs me; the first item flies to the open breach, about forty hours from its seventy-two hour limit.'],
      async run(h) {
        await h.click(h.page.getByRole('button', { name: /Breach BR-0004: notify within 72 hours/ }));
        await h.pause(4000);
      },
    },
    {
      id: 'escapement',
      say: [
        'In the Escapement the clock counts to the second, and closing stays blocked until a decision is on record.',
        'I rate the risk, decide to notify the authority, and the decision goes straight into the logbook.',
      ],
      async run(h) {
        await h.click(h.page.getByTestId('focus-open'));
        await h.pause(2500);
        await h.spotlight(h.page.getByTestId('breach-close'), 2000);
        await h.scrollTo(h.page.getByTestId('decision-form'));
        await h.click(h.page.getByTestId('decision-form').getByText('Risk', { exact: true }));
        await h.click(h.page.getByTestId('decision-form').getByText('Notify authority', { exact: true }));
        await h.click(h.page.getByTestId('decide'));
        await h.pause(2000);
      },
    },
    {
      id: 'view-as',
      say: ['View the tower as a system owner and only the clocks with a task for them stay lit.'],
      async run(h) {
        await h.goto('/', ALEX);
        await h.pause(1200);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Owner/ }));
        await h.pause(3500);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: /Officer/ }));
      },
    },
    {
      id: 'intake',
      say: ['Logging a request received on the thirty-first of January shows its due date as I type: the last day of February.'],
      async run(h) {
        await h.goto('/intake', ALEX);
        await h.pause(1200);
        await h.fill(h.page.getByTestId('received-date'), '2026-01-31');
        await h.spotlight(h.page.getByTestId('due-preview'), 3500);
      },
    },
    {
      id: 'extension',
      say: ['An extension adds up to two months, but only if the person was told within the first month, so for this overdue request it is blocked.'],
      async run(h) {
        await h.goto('/', ALEX);
        await h.click(h.page.getByRole('radio', { name: 'List' }));
        await h.click(h.page.getByRole('link', { name: 'DSR-0133', exact: true }));
        await h.pause(1200);
        await h.spotlight(h.page.getByTestId('extend-blocked'), 3500);
      },
    },
    {
      id: 'gears',
      say: [
        'System owners get their search, export and erase tasks on the Gears board.',
        'When Sam marks his CRM erasure done, the gear turns and the request dial fills in a segment.',
      ],
      async run(h) {
        await h.goto('/gears', SAM);
        await h.pause(2500);
        const row = h.page.locator('[data-testid="gear-column"][data-system="CRM"]').getByTestId('task-row').filter({ hasText: 'DSR-0140' });
        await h.click(row.getByTestId('task-done'));
        await h.pause(1200);
        await h.click(h.page.getByRole('button', { name: 'See the dial' }));
        await h.pause(3500);
      },
    },
    {
      id: 'logbook',
      say: [
        'Every step lands in a logbook nobody can edit, in order and ready to print for a regulator.',
        'The Almanac shows how the clocks have run: on time by month, days to close, and every breach against seventy-two hours.',
      ],
      async run(h) {
        await h.goto('/logbook', ALEX);
        await h.click(h.page.getByRole('button', { name: /^DSR-0131/ }));
        await h.pause(3500);
        await h.goto('/almanac', ALEX);
        await h.pause(4500);
      },
    },
    {
      id: 'takeaway',
      say: ['Clocks you can see and steps you can prove: that is what a privacy deadline needs.'],
      async run(h) {
        await h.goto('/', ALEX);
        await h.pause(4000);
      },
    },
  ],
};
