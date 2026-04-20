// src/lib/supabaseGateway.js
// Barrel re-export — merges all domain gateways into a single object
// for backwards compatibility. New code should import domain gateways directly.

import { getTenantId, isRecurrenceActiveForMonth } from "./gateways/helpers";
import { studentGateway } from "./gateways/studentGateway";
import { teacherGateway } from "./gateways/teacherGateway";
import { payerGateway } from "./gateways/payerGateway";
import { turmaGateway } from "./gateways/turmaGateway";
import { paymentGateway } from "./gateways/paymentGateway";
import { expenseGateway } from "./gateways/expenseGateway";
import { otherRevenueGateway } from "./gateways/otherRevenueGateway";
import { financeKpisGateway } from "./gateways/financeKpisGateway";
import { settingsGateway } from "./gateways/settingsGateway";

export const supabaseGateway = {
  getTenantId,
  ...studentGateway,
  ...teacherGateway,
  ...payerGateway,
  ...turmaGateway,
  ...paymentGateway,
  ...expenseGateway,
  ...otherRevenueGateway,
  ...financeKpisGateway,
  ...settingsGateway,
};

// Re-export helper for external use
export { isRecurrenceActiveForMonth };
