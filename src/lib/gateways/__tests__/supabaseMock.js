/**
 * Shared Supabase mock factory for gateway tests.
 *
 * Usage:
 *   import { vi } from "vitest";
 *   import { createSupabaseMock, mockModule } from "./supabaseMock";
 *
 *   const mock = createSupabaseMock();
 *   vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));
 *
 * Then configure per-test:
 *   mock._result = { data: [...], error: null };
 */

/**
 * Creates a chainable mock that records calls and returns `mock._result`
 * at the terminal call (.single(), awaited select, etc.).
 */
export function createSupabaseMock() {
  // Default result — override per test via mock._result
  const mock = {
    _result: { data: null, error: null },
    _rpcResults: {},
  };

  // Chainable query builder
  function chainable() {
    const chain = {};
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
    chain.then = (resolve) => resolve(mock._result);
    return chain;
  }

  mock.from = vi.fn(() => chainable());

  mock.rpc = vi.fn((fnName, _params) => {
    if (mock._rpcResults[fnName]) {
      return Promise.resolve(mock._rpcResults[fnName]);
    }
    return Promise.resolve(mock._result);
  });

  mock.auth = {
    getSession: vi.fn(() =>
      Promise.resolve({ data: { session: { access_token: "test-token" } } })
    ),
  };

  return mock;
}
