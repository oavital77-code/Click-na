import { describe, expect, it, vi } from "vitest";

const getCurrentTherapist = vi.hoisted(() => vi.fn());
const writeBlocked = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/auth", () => ({ getCurrentTherapist }));
vi.mock("@/lib/require-access", () => ({ writeBlocked }));

const { requireTherapist } = await import("@/lib/route-auth");

describe("requireTherapist", () => {
  it("lets an active therapist through", async () => {
    getCurrentTherapist.mockResolvedValue({ id: "t1", status: "active" });
    expect(await requireTherapist({ write: true })).toMatchObject({ ok: true });
  });

  it("turns away a suspended or deleted practice, reads included", async () => {
    for (const status of ["suspended", "deleted"]) {
      getCurrentTherapist.mockResolvedValue({ id: "t1", status });
      const gate = await requireTherapist();
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.response.status).toBe(403);
    }
  });

  it("answers 401 when nobody is signed in", async () => {
    getCurrentTherapist.mockResolvedValue(null);
    const gate = await requireTherapist();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });
});
