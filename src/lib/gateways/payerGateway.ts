import { supabase } from "../supabaseClient";
import type { Payer } from "@/types";

export const payerGateway = {
  async listPayers(_opts?: { status?: string }): Promise<Payer[]> {
    const { data, error } = await supabase
      .from("payers")
      .select("id, name, email, created_at")
      .order("name", { ascending: true });

    if (error) throw new Error(`listPayers: ${error.message}`);
    return (data || []) as Payer[];
  },

  async createPayer({ name, email = null }: { name: string; email?: string | null }): Promise<Payer> {
    const nm = String(name || "").trim();
    if (!nm) throw new Error("createPayer: 'name' é obrigatório");

    const { data, error } = await supabase
      .from("payers")
      .insert([{ name: nm, email: email || null }])
      .select("id, name, email, created_at")
      .single();

    if (error) throw new Error(`createPayer: ${error.message}`);
    return data as Payer;
  },

  async updatePayer(
    id: string,
    changes: { name?: string; email?: string | null } = {}
  ): Promise<Payer> {
    if (!id) throw new Error("updatePayer: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};
    if (changes.name !== undefined)  patch.name  = String(changes.name || "").trim();
    if (changes.email !== undefined) patch.email = changes.email ? String(changes.email).trim() : null;

    if (!patch.name) throw new Error("updatePayer: 'name' é obrigatório");

    const { data, error } = await supabase
      .from("payers")
      .update(patch)
      .eq("id", id)
      .select("id, name, email, created_at")
      .single();

    if (error) throw new Error(`updatePayer: ${error.message}`);
    return data as Payer;
  },

  async deletePayer(id: string): Promise<{ success: true }> {
    if (!id) throw new Error("deletePayer: 'id' é obrigatório");

    const { error } = await supabase.from("payers").delete().eq("id", id);

    if (error) {
      if (String(error.message).toLowerCase().includes("foreign key")) {
        throw new Error("Não é possível excluir: pagador em uso por alunos/lançamentos.");
      }
      throw new Error(`deletePayer: ${error.message}`);
    }
    return { success: true };
  },
};
