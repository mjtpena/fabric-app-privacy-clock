import type { ReactNode } from 'react';

import { AppLogo } from '@x10/shared/runtime';

import { articles, law, rules } from '../config';
import { MiniDial } from '../tower/Dial';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-line py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <h2 className="x-legend-label m-0 pt-1 text-muted">{title}</h2>
      <div className="min-w-0 text-sm leading-6 text-fg">{children}</div>
    </section>
  );
}

/** About: the pitch, how to use it, the rules and thresholds from config.ts, the law it supports. */
export function AboutPage() {
  return (
    <div className="mx-auto max-w-[880px]">
      <header className="mb-8 flex flex-wrap items-center gap-6">
        <div className="flex items-center -space-x-3">
          <MiniDial size={92} id="about-breach" kind="breach" type="breach" fraction={0.43} state="on_track" running rim="var(--accent-9)" sweep="var(--ok-solid)" tasks={['done', 'open']} ticks={24} majorEvery={6} />
          <MiniDial size={70} id="about-overdue" kind="request" type="erasure" fraction={1.12} state="overdue" running rim="var(--bad-solid)" sweep="var(--bad-solid)" tasks={['done', 'blocked', 'open']} ticks={30} majorEvery={7} />
          <MiniDial size={70} id="about-soon" kind="request" type="access" fraction={0.64} state="due_soon" running rim="var(--warn-solid)" sweep="var(--warn-solid)" tasks={['done', 'done']} ticks={30} majorEvery={7} />
        </div>
        <div className="min-w-0 flex-1 basis-[320px]">
          <div className="mb-2 flex items-center gap-2">
            <AppLogo size={20} />
            <span className="x-legend-label text-muted">Privacy Clock</span>
          </div>
          <h1 className="x-serif m-0 text-4xl leading-tight text-fg">Every privacy request and breach with its legal clock running, every step recorded.</h1>
        </div>
      </header>

      <Block title="Why">
        <p className="m-0">
          Data subject requests and personal data breaches come with legal deadlines, and most teams track them in a shared inbox. The clocks are discovered when they
          have already run out. Privacy Clock puts every open request and breach on one tower with its deadline running, sends each system that holds personal data to
          its owner as a task, and writes every step to a logbook you can show a regulator.
        </p>
      </Block>

      <Block title="The tower">
        <ul className="m-0 list-disc space-y-1.5 pl-5 marker:text-[var(--gray-8)]">
          <li>Each open request is a round dial on a floor of the tower; each open breach is a larger hexagonal dial in the belfry.</li>
          <li>The tinted sweep and the hand show how much of the legal time is used. A dotted notch marks the first due date of an extended request.</li>
          <li>The inner ring has one segment per task: green done, red blocked, grey open.</li>
          <li>Overdue dials crack, their hand ticks red, and a red arc outside the bezel grows with the overrun.</li>
          <li>Lenses regroup the floors by clock state, type, who holds the next step, the system it waits on, or stage. View as a system owner and everything without a task for them steps back.</li>
          <li>The clock in the gable is now: the time every dial is measured against. The list view holds the same clocks in a sortable table.</li>
        </ul>
      </Block>

      <Block title="How to use it">
        <ol className="m-0 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-[var(--gray-9)]">
          <li>
            <strong className="font-medium">Intake</strong>: log a request (privacy officers) with the due date computed live as you type the received date, or report a
            suspected breach (anyone).
          </li>
          <li>
            <strong className="font-medium">Gears</strong>: system owners search, export, erase or correct data in their systems and mark each task done or blocked.
          </li>
          <li>
            <strong className="font-medium">Escapement</strong>: assess a breach (data, numbers, risk), decide, record the notifications, contain and close it.
          </li>
          <li>
            <strong className="font-medium">Logbook</strong>: every event per item, in order, printable. <strong className="font-medium">Almanac</strong>: on-time
            rate by month, days to close, requests by type.
          </li>
        </ol>
      </Block>

      <Block title="The law">
        <ul className="m-0 list-disc space-y-1.5 pl-5 marker:text-[var(--gray-8)]">
          <li>
            <strong className="font-medium">GDPR {articles.request}</strong>: answer a data subject request within <span className="num">{law.requestMonths}</span>{' '}
            month of receipt, extendable by <span className="num">{law.extensionMaxMonths}</span> further months where requests are complex or numerous, if the person
            is told within the first month, with the reasons.
          </li>
          <li>
            <strong className="font-medium">GDPR {articles.breach}</strong>: notify the supervisory authority within <span className="num">{law.breachHours}</span>{' '}
            hours of becoming aware of a personal data breach, unless it is unlikely to result in a risk to people. A later notification gives the reasons for the delay.
          </li>
          <li>
            <strong className="font-medium">GDPR {articles.documentation}</strong>: document every breach, its effects and the action taken, even when it is not
            notified.
          </li>
          <li>
            <strong className="font-medium">GDPR {articles.subjects}</strong>: tell the people affected without undue delay when the breach is likely to result in a
            high risk to them.
          </li>
        </ul>
      </Block>

      <Block title="Rules in this app">
        <ul className="m-0 list-disc space-y-1.5 pl-5 marker:text-[var(--gray-8)]">
          <li>
            Due date: the same day of the next month; when that day does not exist, the last day of that month (31 January is due on 28 or 29 February). This mirrors
            the regulator guidance. The request is in time if closed by the end of that day.
          </li>
          <li>
            Extension: one or two calendar months from the original due date, by the same day rule, only with a reason of at least{' '}
            <span className="num">{rules.extensionReasonMin}</span> characters and only if the person was told on or before the original due date. After that date
            it is blocked.
          </li>
          <li>
            Breach clock: exactly <span className="num">{law.breachHours}</span> hours from awareness, which is when the breach was confirmed. A breach first reported
            as suspected keeps that earlier time in its logbook.
          </li>
          <li>
            Clock states: on track with more than <span className="num">{rules.dueSoonShare * 100}%</span> of the time left, due soon at or below it, critical at or
            below <span className="num">{rules.criticalShare * 100}%</span> (or under <span className="num">{rules.breachCriticalHours}</span> hours for a breach),
            overdue once the deadline passes.
          </li>
          <li>
            The clock never pauses. Some guidance allows the month to start once identity is verified; the app counts from receipt unless the officer logs the
            verification date as the received date.
          </li>
          <li>
            A breach cannot close without a decision. &ldquo;Document only&rdquo; needs a risk rationale of at least <span className="num">{rules.rationaleMin}</span>{' '}
            characters. Past {law.breachHours} hours without notification, the case shows &ldquo;late: reasons for delay required&rdquo; and asks for them (at least{' '}
            <span className="num">{rules.delayReasonMin}</span> characters).
          </li>
          <li>An erasure request cannot close while any of its erase tasks is open or blocked.</li>
          <li>Every status change writes an event. Events are never edited or deleted.</li>
        </ul>
      </Block>

      <Block title="Who can do what">
        <p className="m-0">
          Everyone who can open the app reads every request, breach and logbook; requests carry a pseudonymous subject label, not a full identity. Privacy officers
          are the people the app owner marks as admins: they log and close requests, assess breaches and decide notifications. System owners update the tasks
          assigned to them. Anyone signed in can report a breach.
        </p>
        <p className="m-0 mt-3 text-ui text-muted">
          The database only lets an officer change the requests and breaches they handle, freezes the dates a clock is computed from, lets a task&apos;s assignee
          or officer update it, and lets nobody change or delete an event.
        </p>
      </Block>

      <Block title="Please note">
        <p className="m-0 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui" role="note">
          Privacy Clock supports the process of answering requests and handling breaches. It is not legal advice and does not replace the judgement of your data
          protection officer or legal counsel. Check deadlines against the law and guidance that apply to you.
        </p>
        <p className="mt-6 text-ui text-faint">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
      </Block>
    </div>
  );
}
