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
 *   mock._result = { data: [...], error: null };                  // resultado global
 *   mock._tableResults.sessions = { data: [...], error: null };   // por tabela
 *   mock._tableResults.attendance = [{...}, {...}];                // fila por tabela
 *
 * Resolução do resultado terminal (await / .single() / .maybeSingle()):
 *   1. Se `_tableResults[table]` for um array → consome o próximo (o último
 *      repete quando a fila esgota) — útil quando a mesma tabela é consultada
 *      mais de uma vez com resultados diferentes.
 *   2. Se `_tableResults[table]` for um objeto → usa para toda query da tabela.
 *   3. Senão → `_result` (fallback global).
 *
 * `mock._calls` grava cada método chamado ({ table, method, args }) para
 * asserções de payload (ex.: o que foi passado ao .upsert()/.insert()).
 */
import { vi, type Mock } from "vitest";

export type MockResult = { data: unknown; error: unknown };

export type CallRecord = { table: string; method: string; args: unknown[] };

export type SupabaseMock = {
  _result: MockResult;
  _tableResults: Record<string, MockResult | MockResult[]>;
  _rpcResults: Record<string, MockResult>;
  _calls: CallRecord[];
  /** contador de consumo das filas por tabela — resete em beforeEach junto com _tableResults */
  _consumed: Record<string, number>;
  from: Mock;
  rpc: Mock;
  auth: { getSession: Mock };
};

/**
 * Creates a chainable mock that records calls and returns the resolved result
 * at the terminal call (.single(), awaited select, etc.).
 */
export function createSupabaseMock(): SupabaseMock {
  // Default result — override per test via mock._result / mock._tableResults
  const mock: SupabaseMock = {
    _result: { data: null, error: null },
    _tableResults: {},
    _rpcResults: {},
    _calls: [],
    _consumed: {},
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "test-token" } } })
      ),
    },
  };

  // Consumo por tabela (para filas em _tableResults[table] = [...]). Vive em
  // mock._consumed para que o beforeEach possa resetá-lo entre testes — senão o
  // índice vaza e a próxima fila começa no meio.
  function resultFor(table: string): MockResult {
    const tr = mock._tableResults[table];
    if (tr === undefined) return mock._result;
    if (Array.isArray(tr)) {
      if (tr.length === 0) return mock._result;
      const i = mock._consumed[table] ?? 0;
      const idx = Math.min(i, tr.length - 1); // o último resultado repete
      mock._consumed[table] = i + 1;
      return tr[idx];
    }
    return tr;
  }

  // Chainable query builder, atado a uma tabela.
  function chainable(table: string) {
    const chain: Record<string, unknown> = {};
    const methods = [
      "select", "insert", "update", "upsert", "delete",
      "eq", "neq", "in", "gte", "lte", "lt", "gt",
      "not", "ilike", "is",
      "order", "limit", "range",
      "single", "maybeSingle",
    ];
    for (const m of methods) {
      chain[m] = vi.fn((...args: unknown[]) => {
        mock._calls.push({ table, method: m, args });
        return chain;
      });
    }
    // Make it thenable so `await supabase.from(...).select(...)` works
    chain.then = (resolve: (_r: MockResult) => unknown) => resolve(resultFor(table));
    return chain;
  }

  mock.from.mockImplementation((table: string) => chainable(table));

  mock.rpc.mockImplementation((fnName: string) => {
    if (mock._rpcResults[fnName]) {
      return Promise.resolve(mock._rpcResults[fnName]);
    }
    return Promise.resolve(mock._result);
  });

  return mock;
}
