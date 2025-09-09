"use client";

import { useSession } from "@/contexts/SessionContext";

/**
 * Guard: restringe acesso com base em papéis (roles).
 *
 * Uso:
 *   <Guard roles={["admin","financeiro"]}>
 *     <ConteudoRestrito />
 *   </Guard>
 *
 * Props:
 * - roles: array de papéis permitidos (ex.: ["admin", "professor"])
 * - fallback: renderizado quando usuário não tem permissão (default: null)
 * - children: conteúdo a ser protegido
 */
export default function Guard({ roles, fallback = null, children }) {
  const { session } = useSession();

  // Caso ainda não exista sessão (loading ou erro)
  if (!session) return null;

  // Verifica se o papel atual está na lista de permitidos
  const allowed = Array.isArray(roles) ? roles.includes(session.role) : true;

  if (!allowed) {
    return fallback ?? (
      <div className="p-4 text-sm text-gray-500">
        Acesso não autorizado para este perfil.
      </div>
    );
  }

  return <>{children}</>;
}
