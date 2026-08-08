import { describe, expect, it, vi } from "vitest";
import { LiveFoundryScheduler } from "../../src/app/live-foundry-scheduler";
import type { TearFoundryScheduleProjectionV1 } from "../../src/agents";

const hash = "a".repeat(16);
const due = (disposition: TearFoundryScheduleProjectionV1["disposition"] = "due"): TearFoundryScheduleProjectionV1 => ({ scheduleHash: hash, jobHash: "b".repeat(16), state: "enabled", disposition, dueAt: "2026-08-08T00:00:00.000Z", intervalMs: 60_000, revision: 1 });

describe("C36 app-owned local Foundry scheduler", () => {
  it("starts from durable discovery, runs one due schedule, serializes overlap, and schedules the next bounded wake", async () => {
    let release!: () => void, callback: (() => void) | undefined;
    const execute = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const scheduler = new LiveFoundryScheduler({ discover: vi.fn(() => Promise.resolve([due(), { ...due(), scheduleHash: "c".repeat(16) }])), execute, now: () => new Date("2026-08-08T00:01:00.000Z"), defer: (fn) => { callback = fn; return 1 as ReturnType<typeof setTimeout>; }, cancel: vi.fn(), leaseId: () => "lease" });
    scheduler.start(); await Promise.resolve(); await scheduler.wake();
    expect(execute).toHaveBeenCalledOnce(); expect(scheduler.status(hash)).toBe("running");
    release(); await Promise.resolve(); await Promise.resolve();
    expect(scheduler.status(hash)).toBe("configured"); expect(callback).toBeDefined();
    scheduler.stop();
  });

  it("rediscovers after restart, never executes disabled or blocked work, and exposes truthful local statuses", async () => {
    const execute = vi.fn();
    const ports = { discover: vi.fn(() => Promise.resolve([{ ...due(), state: "disabled" as const, disposition: "disabled" as const }, { ...due(), scheduleHash: "c".repeat(16), disposition: "blocked-revoked-custody" as const }])), execute, now: () => new Date("2026-08-08T00:01:00.000Z"), defer: () => 1 as ReturnType<typeof setTimeout>, cancel: vi.fn(), leaseId: () => "lease" };
    const first = new LiveFoundryScheduler(ports); first.start(); await Promise.resolve(); await Promise.resolve(); first.stop();
    const restarted = new LiveFoundryScheduler(ports); restarted.start(); await Promise.resolve(); await Promise.resolve();
    expect(execute).not.toHaveBeenCalled(); expect(restarted.status(hash)).toBe("disabled"); expect(restarted.status("c".repeat(16))).toBe("blocked"); restarted.stop();
  });

  it("retains an execution failure as error without retrying a second schedule in that wake", async () => {
    const second = "c".repeat(16), execute = vi.fn(() => Promise.reject(new Error("custody lost")));
    const scheduler = new LiveFoundryScheduler({ discover: () => Promise.resolve([due(), { ...due(), scheduleHash: second }]), execute, now: () => new Date("2026-08-08T00:01:00.000Z"), defer: () => 1 as ReturnType<typeof setTimeout>, cancel: vi.fn(), leaseId: () => "lease" });
    scheduler.start(); await Promise.resolve(); await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1); expect(scheduler.status(hash)).toBe("error"); expect(scheduler.status(second)).toBe("due"); scheduler.stop();
  });
});
