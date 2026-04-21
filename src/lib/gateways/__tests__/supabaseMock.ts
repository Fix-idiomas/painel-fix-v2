/**
 * Shared Supabase mock factory for gateway tests.
 *
 * Usage:
 *   import { vi } from "vitest";
 *   import { createSupabaseMock } from "./supabaseMock";
 *
 *   const mock = createSupabaseMock();
 *   vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));
 *
 * Then configure per-test:
 *   mock._result = { data: [...], error: null };
 */
import { vi, type Mock } from "vitest";

export type MockResult = { data: unknown; error: unknown };

export type SupabaseMock = {
  _result: MockResult;
  _rpcResults: Record<string, MockResult>;
  from: Mock;
  rpc: Mock;
  auth: { getSession: Mock };
};

/**
 * Creates a chainable mock that records calls and returns `mock._result`
 * at the terminal call (.single(), awaited select, etc.).
 */
export function createSupabaseMock(): SupabaseMock {
  // Default result — override per test via mock._result
  const mock: SupabaseMock = {
    _result: { data: null, error: null },
    _rpcResults: {},
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } })
      ),
    },
  };

  // Chainable query builder
  function chainable() {
    const chain: Record<string, unknown> = {};
    const methods = [
      "select", "insert", "update", "upsert", "delete",
      "eq", "neq", "in", "gte", "lte", "lt", "gt",
      "not", "ilike", "is",
      "order", "limit", "range",
      "single", "maybeSingle",
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    // Make it thenable so `await supabase.from(...).select(...)` works
    chain.then = (resolve: (r: MockResult) => unknown) => resolve(mock._result);
    return chain;
  }

  mock.from.mockImplementation(() => chainable());

  mock.rpc.mockImplementation((fnName: string) => {
    if (mock._rpcResults[fnName]) {
      return Promise.resolve(mock._rpcResults[fnName]);
    }
    return Promise.resolve(mock._result);
  });

  return mock;
}
