import type { LifecycleSummary } from "@/lib/billing-lifecycle";
import type { SendDueRemindersSummary } from "@/lib/notifications";

/**
 * What in a cron run the operator should hear about. The run's JSON summary
 * is only ever read by whoever is looking at it, and on the daily schedule
 * nobody is; a failed renewal charge or a reminder that did not go out has
 * to reach a person on its own.
 */
export function cronProblems(run: { reminders: SendDueRemindersSummary; billing: LifecycleSummary }): string[] {
  const problems: string[] = [];
  if (run.reminders.failed > 0) problems.push(`${run.reminders.failed} reminder(s) failed to send`);
  if (run.billing.renewals.errors > 0) problems.push(`${run.billing.renewals.errors} renewal charge(s) errored at PayPlus`);
  if (run.billing.renewals.noToken > 0) problems.push(`${run.billing.renewals.noToken} renewal(s) had no stored card to charge`);
  if (run.billing.renewals.declined > 0) problems.push(`${run.billing.renewals.declined} renewal charge(s) were declined`);
  if (run.billing.unconfirmed > 0) problems.push(`${run.billing.unconfirmed} paid period(s) ended with no renewal confirmed`);
  if (run.billing.locked > 0) problems.push(`${run.billing.locked} account(s) locked after grace ran out`);
  return problems;
}
