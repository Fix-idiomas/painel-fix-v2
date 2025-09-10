// src/lib/financeGateway.js
import { supabaseGateway } from "./supabaseGateway";
import mockGatewayDefault, { financeGateway as mockNamed } from "./financeGateway.mock";

// Aceita mock exportado como default OU named
const mockGateway = mockNamed || mockGatewayDefault;

// Fonte preferida via env (NEXT_PUBLIC_GATEWAY tem precedência)
const SRC = (
  process.env.NEXT_PUBLIC_GATEWAY ||
  process.env.NEXT_PUBLIC_DATA_SRC ||
  "supabase"
).trim().toLowerCase();

const preferSupabase = SRC === "supabase";

// Escolhas primária e fallback
const primary  = preferSupabase ? supabaseGateway : mockGateway;
const fallback = preferSupabase ? mockGateway      : supabaseGateway;

const gwName = (gw) => (gw === supabaseGateway ? "supabaseGateway" : "mockGateway");

// Expor para debug no UI
export const ADAPTER_NAME = preferSupabase ? "supabase (preferred)" : "mock (preferred)";

// Helper seguro para checar se o objeto realmente tem a prop (evita protótipo)
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Wrapper dinâmico com Proxy: tenta na fonte primária; se não existir, cai no fallback.
// Assim você NÃO precisa manter lista de funções manualmente.
export const financeGateway = new Proxy(
  {},
  {
    get(_target, prop) {
      // suporte a símbolos e coisas internas do runtime
      if (typeof prop === "symbol") return undefined;

      // nome do adaptador
      if (prop === "ADAPTER_NAME") return ADAPTER_NAME;

      // Existe no primário?
      if (hasOwn(primary, prop)) {
        const v = primary[prop];
        return typeof v === "function" ? (...args) => v.apply(primary, args) : v;
      }

      // Senão, tenta fallback (e loga aviso no browser)
      if (hasOwn(fallback, prop)) {
        if (typeof window !== "undefined") {
          console.warn(
            `[financeGateway] "${String(prop)}" ausente em ${gwName(primary)} — usando ${gwName(fallback)}`
          );
        }
        const v = fallback[prop];
        return typeof v === "function" ? (...args) => v.apply(fallback, args) : v;
      }

      // Nem primário nem fallback
      return () => {
        throw new Error(
          `financeGateway: função/propriedade "${String(prop)}" não encontrada em ${gwName(primary)} nem em ${gwName(fallback)}`
        );
      };
    },
  }
);

export default financeGateway;
