export interface PermSession {
  role?: string | null;
  teacherId?: string | null;
  perms?: Record<string, Record<string, boolean>> | null;
}

export function isOwner(session: PermSession | null | undefined): boolean {
  return session?.role === "owner";
}

export function hasPerm(session: PermSession | null | undefined, path: string): boolean {
  if (!session) return false;
  if (isOwner(session)) return true;
  const [area, key] = String(path).split(".");
  const areaObj = session?.perms?.[area];
  if (!areaObj) return false;
  return !!areaObj[key];
}

export function canEditTurma(
  session: PermSession | null | undefined,
  turma: { teacher_id?: string | null } | null | undefined,
): boolean {
  if (isOwner(session)) return true;
  if (!hasPerm(session, "classes.write_own")) return false;
  if (!session?.teacherId) return false;
  return turma?.teacher_id === session.teacherId;
}

export function canEditAluno(
  session: PermSession | null | undefined,
  aluno: { assigned_teacher_id?: string | null } | null | undefined,
): boolean {
  if (isOwner(session)) return true;
  if (!hasPerm(session, "students.write_own")) return false;
  if (!session?.teacherId) return false;
  return aluno?.assigned_teacher_id === session.teacherId;
}
