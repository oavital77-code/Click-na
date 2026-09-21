import { describe, expect, it } from "vitest";
import { cronProblems } from "@/lib/cron-health";

const quiet = {
  reminders: { sent: 12, failed: 0 },
  billing: { reminders: 2, ended: 0, locked: 0, unconfirmed: 0, renewals: { charged: 3, declined: 0, errors: 0, noToken: 0 } },
};

describe("cronProblems", () => {
  it("has nothing to say about a run where everything went through", () => {
    expect(cronProblems(quiet)).toEqual([]);
  });

  it("names each thing that needs a person, one line per kind", () => {
    const problems = cronProblems({
      reminders: { sent: 10, failed: 2 },
      billing: { ...quiet.billing, locked: 1, unconfirmed: 1, renewals: { charged: 1, declined: 1, errors: 2, noToken: 1 } },
    });
    expect(problems).toHaveLength(6);
    expect(problems.join("\n")).toContain("2 reminder(s) failed");
    expect(problems.join("\n")).toContain("2 renewal charge(s) errored");
    expect(problems.join("\n")).toContain("locked");
  });
});
