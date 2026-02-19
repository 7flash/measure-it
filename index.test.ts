import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { measure, measureSync, resetCounter } from "./index.ts";

// Capture console output for assertions
function captureConsole() {
    const logs: string[] = [];
    const errors: string[] = [];

    const logSpy = spyOn(console, "log").mockImplementation((...args: any[]) => {
        logs.push(args.map(String).join(" "));
    });
    const errorSpy = spyOn(console, "error").mockImplementation((...args: any[]) => {
        errors.push(args.map(String).join(" "));
    });

    return {
        logs,
        errors,
        restore: () => {
            logSpy.mockRestore();
            errorSpy.mockRestore();
        },
    };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── measure (async) ─────────────────────────────────────────────────

describe("measure (async)", () => {
    beforeEach(() => resetCounter());

    test("runs a function and returns its result", async () => {
        const out = captureConsole();
        const result = await measure("my op", async () => 42);
        out.restore();

        expect(result).toBe(42);
    });

    test("logs start and success", async () => {
        const out = captureConsole();
        await measure("fetch data", async () => "ok");
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] fetch data");
        expect(out.logs[1]).toMatch(/< \[a\] ✓ \d+\.\d+ms/);
    });

    test("returns null and logs error on throw", async () => {
        const out = captureConsole();
        const result = await measure("will fail", async () => {
            throw new Error("boom");
        });
        out.restore();

        expect(result).toBeNull();
        expect(out.logs[1]).toMatch(/< \[a\] ✗ \d+\.\d+ms \(boom\)/);
        expect(out.errors.length).toBeGreaterThan(0);
    });

    test("logs error cause when present", async () => {
        const out = captureConsole();
        await measure("caused error", async () => {
            throw new Error("fail", { cause: { reason: "test" } });
        });
        out.restore();

        const causeLog = out.errors.find((e) => e.includes("Cause:"));
        expect(causeLog).toBeDefined();
    });

    test("label-only call (no function) logs start and returns null", async () => {
        const out = captureConsole();
        const result = await measure("annotation only");
        out.restore();

        expect(result).toBeNull();
        expect(out.logs[0]).toStartWith("> [a] annotation only");
        expect(out.logs.length).toBe(1); // no completion log
    });

    test("object label extracts .label and logs extra params", async () => {
        const out = captureConsole();
        await measure({ label: "Fetch User", userId: 5 }, async () => "ok");
        out.restore();

        expect(out.logs[0]).toContain("Fetch User");
        expect(out.logs[0]).toContain("userId=5");
    });

    test("nested measure produces hierarchical IDs", async () => {
        const out = captureConsole();
        await measure("parent", async (m) => {
            await m("child A", async () => 1);
            await m("child B", async () => 2);
        });
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] parent");
        expect(out.logs[1]).toStartWith("> [a-a] child A");
        expect(out.logs[3]).toStartWith("> [a-b] child B");
    });

    test("deeply nested measure produces correct IDs", async () => {
        const out = captureConsole();
        await measure("root", async (m) => {
            await m("level 1", async (m2) => {
                await m2("level 2", async () => "deep");
            });
        });
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] root");
        expect(out.logs[1]).toStartWith("> [a-a] level 1");
        expect(out.logs[2]).toStartWith("> [a-a-a] level 2");
    });

    test("multiple top-level calls get sequential IDs", async () => {
        const out = captureConsole();
        await measure("first", async () => 1);
        await measure("second", async () => 2);
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] first");
        expect(out.logs[2]).toStartWith("> [b] second");
    });

    test("nested annotation (label only) inside measure", async () => {
        const out = captureConsole();
        await measure("parent", async (m) => {
            await m("just a note");
            await m("do work", async () => 42);
        });
        out.restore();

        // Annotation uses '=' prefix
        expect(out.logs[1]).toStartWith("= [a] just a note");
    });

    test("child error does not crash parent", async () => {
        const out = captureConsole();
        const result = await measure("parent", async (m) => {
            const childResult = await m("failing child", async () => {
                throw new Error("child error");
            });
            expect(childResult).toBeNull();
            return "parent ok";
        });
        out.restore();

        expect(result).toBe("parent ok");
    });

    test("non-Error throw is handled gracefully", async () => {
        const out = captureConsole();
        const result = await measure("string throw", async () => {
            throw "raw string error";
        });
        out.restore();

        expect(result).toBeNull();
        expect(out.logs[1]).toContain("raw string error");
    });
});

// ─── measureSync ─────────────────────────────────────────────────────

describe("measureSync", () => {
    beforeEach(() => resetCounter());

    test("runs a function and returns its result", () => {
        const out = captureConsole();
        const result = measureSync("compute", () => 100);
        out.restore();

        expect(result).toBe(100);
    });

    test("logs start and success", () => {
        const out = captureConsole();
        measureSync("parse json", () => JSON.parse('{"a":1}'));
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] parse json");
        expect(out.logs[1]).toMatch(/< \[a\] ✓ \d+\.\d+ms/);
    });

    test("returns null and logs error on throw", () => {
        const out = captureConsole();
        const result = measureSync("will fail", () => {
            throw new Error("sync boom");
        });
        out.restore();

        expect(result).toBeNull();
        expect(out.logs[1]).toMatch(/✗/);
        expect(out.logs[1]).toContain("sync boom");
    });

    test("label-only call returns null", () => {
        const out = captureConsole();
        const result = measureSync("just a note");
        out.restore();

        expect(result).toBeNull();
        expect(out.logs[0]).toStartWith("> [a] just a note");
    });

    test("nested measureSync produces hierarchical IDs", () => {
        const out = captureConsole();
        measureSync("parent", (m) => {
            m("child X", () => 10);
            m("child Y", () => 20);
            return 30;
        });
        out.restore();

        expect(out.logs[0]).toStartWith("> [a] parent");
        expect(out.logs[1]).toStartWith("> [a-a] child X");
        expect(out.logs[3]).toStartWith("> [a-b] child Y");
    });

    test("child error does not crash parent (sync)", () => {
        const out = captureConsole();
        const result = measureSync("parent", (m) => {
            const bad = m("fail", () => {
                throw new Error("nope");
            });
            expect(bad).toBeNull();
            return "still ok";
        });
        out.restore();

        expect(result).toBe("still ok");
    });
});

// ─── toAlpha / ID generation ─────────────────────────────────────────

describe("ID generation", () => {
    beforeEach(() => resetCounter());

    test("generates sequential alpha IDs for many calls", async () => {
        const out = captureConsole();
        for (let i = 0; i < 28; i++) {
            await measure(`op-${i}`, async () => null);
        }
        out.restore();

        // First 26: a-z, then 27th = aa, 28th = ab
        expect(out.logs[0]).toStartWith("> [a]");
        expect(out.logs[50]).toStartWith("> [z]"); // 26th call (index 25) => lines 50,51
        expect(out.logs[52]).toStartWith("> [aa]"); // 27th
        expect(out.logs[54]).toStartWith("> [ab]"); // 28th
    });
});

// ─── resetCounter ────────────────────────────────────────────────────

describe("resetCounter", () => {
    test("resets global ID counter", async () => {
        resetCounter();

        const out1 = captureConsole();
        await measure("first run", async () => null);
        out1.restore();
        expect(out1.logs[0]).toStartWith("> [a]");

        resetCounter();

        const out2 = captureConsole();
        await measure("second run", async () => null);
        out2.restore();
        expect(out2.logs[0]).toStartWith("> [a]"); // back to [a]
    });
});
