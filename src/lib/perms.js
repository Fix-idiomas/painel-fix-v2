// src/lib/perms.js
export function isOwner(session) {
  return session?.role === "owner";
}

// path: "finance.manage" | "classes.read" | "students.write_own" etc.
export function hasPerm(session, path) {
  if (!session) return false;
  if (isOwner(session)) return true; // owner passa em tudo
  const [area, key] = String(path).split(".");
  const areaObj = session?.perms?.[area];
  if (!areaObj) return false;
  return !!areaObj[key];
}

// Ex.: professor só pode editar turma/aluno atribuídos a ele.
export function canEditTurma(session, turma) {
  if (isOwner(session)) return true;
  // precisa de permissão "classes.write_own"
  if (!hasPerm(session, "classes.write_own")) return false;
  // Regra de posse: turma.teacher_id === session.teacherId (ou turma.teachers.includes(...))
  if (!session?.teacherId) return false;
  return turma?.teacher_id === session.teacherId;
}

export function canEditAluno(session, aluno) {
  if (isOwner(session)) return true;
  if (!hasPerm(session, "students.write_own")) return false;
  if (!session?.teacherId) return false;
  // Você pode adaptar: aluno.assigned_teacher_id, aluno.turma.teacher_id, etc.
  return aluno?.assigned_teacher_id === session.teacherId;
}
