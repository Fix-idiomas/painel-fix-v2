import { financeGateway as mock } from "./financeGateway.mock.js";
import { financeGateway as supabase } from "./financeGateway.supabase.js";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_FINANCE === "1";
export const financeGateway = USE_MOCK ? mock : supabase;
export const FINANCE_ADAPTER = USE_MOCK ? "MOCK" : "SUPABASE";
