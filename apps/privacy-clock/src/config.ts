/**
 * Statutory figures and app thresholds. The About page and the README read these; change them here only.
 * The app supports the process; it is not legal advice.
 */
export const law = {
  /** GDPR Art. 12(3): respond to a data subject request within one month of receipt. */
  requestMonths: 1,
  /** GDPR Art. 12(3): extendable by two further months, if the person is told within the first month. */
  extensionMaxMonths: 2,
  /** GDPR Art. 33(1): notify the supervisory authority within 72 hours of becoming aware of a breach. */
  breachHours: 72,
} as const;

export const rules = {
  /** Clock states: due soon at or below this share of the legal time left. */
  dueSoonShare: 0.5,
  /** Critical at or below this share of the legal time left… */
  criticalShare: 0.15,
  /** …or, for breaches, under this many hours left. */
  breachCriticalHours: 24,
  /** "Document only" needs a risk rationale of at least this many characters (Art. 33(5)). */
  rationaleMin: 40,
  /** An extension needs a reason of at least this many characters. */
  extensionReasonMin: 20,
  /** A late notification needs reasons for the delay of at least this many characters (Art. 33(1)). */
  delayReasonMin: 20,
  /** Closing or refusing a request needs an outcome of at least this many characters. */
  outcomeMin: 10,
  /** Today lists requests due within this many days. */
  dueWithinDays: 7,
  /** Tasks created at intake are due this many days before the response is due (never in the past). */
  taskLeadDays: 7,
  /** The Almanac covers this many months. */
  almanacMonths: 6,
} as const;

export const articles = {
  request: 'Art. 12(3)',
  breach: 'Art. 33(1)',
  documentation: 'Art. 33(5)',
  subjects: 'Art. 34',
} as const;
