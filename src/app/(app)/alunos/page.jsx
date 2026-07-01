"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";
import { supabase } from "@/lib/supabaseClient";
import AvatarAluno from "@/components/AvatarAluno";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  TrendingUp,
  Power,
  CheckCircle2,
  PauseCircle,
  Users,
  Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
const PAYER_MODE = { SELF: "self", EXISTING: "existing", NEW: "new" };

function fmtBRL(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function formatBirth(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}
function statusChip(s) {
  if (s === "ativo")
    return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativo" };
  return { cls: "p-chip-neutral", icon: PauseCircle, label: "Inativo" };
}

// ─── Página ───────────────────────────────────────────────────────
export default function AlunosPage() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [payers, setPayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ativo");
  const [signedMap, setSignedMap] = useState({});

  // Modais
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function getSignedUrl(path, opts = {}) {
    const key = String(path || "").trim();
    const silent = !!opts.silent;
    if (!key) return null;
    if (signedMap[key]) return signedMap[key];
    try {
      const { data, error: err } = await supabase.storage
        .from("student-photos")
        .createSignedUrl(key, 600);
      if (err) {
        if (!silent) console.warn("[students] createSignedUrl falhou:", err);
        return null;
      }
      const url = data?.signedUrl || null;
      if (url) setSignedMap((m) => ({ ...m, [key]: url }));
      return url;
    } catch (e) {
      if (!silent)
        console.warn("[students] erro inesperado:", e?.message || e);
      return null;
    }
  }

  async function load() {
    try {
      setError(null);
      const [students, py] = await Promise.all([
        financeGateway.listStudents(),
        financeGateway.listPayers?.() ?? [],
      ]);
      setList(Array.isArray(students) ? students : []);
      setPayers(Array.isArray(py) ? py : []);
      // prefetch fotos
      const pending = (students || [])
        .map((s) => String(s.photo_url || "").trim())
        .filter(Boolean)
        .filter((p) => !signedMap[p])
        .slice(0, 100);
      if (pending.length)
        await Promise.all(pending.map((p) => getSignedUrl(p, { silent: true })));
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { todos: list.length, ativo: 0, inativo: 0 };
    for (const s of list) {
      if (s.status === "ativo") c.ativo += 1;
      else if (s.status === "inativo") c.inativo += 1;
    }
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return list.filter((s) => {
      if (filter !== "todos" && s.status !== filter) return false;
      if (!term) return true;
      const name = String(s.name || "").toLowerCase();
      const cpfDigits = String(s.cpf || "").replace(/\D/g, "");
      return name.includes(term) || (digits && cpfDigits.includes(digits));
    });
  }, [list, q, filter]);

  const FILTERS = [
    { key: "ativo", label: "Ativos", count: counts.ativo },
    { key: "inativo", label: "Inativos", count: counts.inativo },
    { key: "todos", label: "Todos", count: counts.todos },
  ];

  async function onToggleStatus(s) {
    const next = s.status === "ativo" ? "inativo" : "ativo";
    await financeGateway.setStudentStatus(s.id, next);
    await load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Alunos
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.todos} cadastrados · ${counts.ativo} ativos · ${counts.inativo} inativos`}
          </p>
        </div>
        <button
          className="p-btn p-btn-primary self-start sm:self-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          <span>Novo aluno</span>
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou CPF…"
          className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
        />
      </div>

      {/* Filtros */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--p-primary)] text-white"
                    : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                ].join(" ")}
              >
                {f.label}
                <span
                  className={[
                    "rounded-full px-1.5 text-xs font-medium tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[var(--p-surface-2)] text-[var(--p-text-faint)]",
                  ].join(" ")}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro ao carregar alunos: {error}
        </div>
      )}

      {/* Lista */}
      <div className="p-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando alunos…
          </div>
        ) : (
          <>
            {/* Tabela desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    <th className="px-5 py-3">Aluno</th>
                    <th className="px-5 py-3">Mensalidade</th>
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3">Nascimento</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {filtered.map((s) => {
                    const { cls, icon: Icon, label } = statusChip(s.status);
                    const photoPath = String(s.photo_url || "").trim();
                    const photoUrl = photoPath ? signedMap[photoPath] : null;
                    return (
                      <tr key={s.id} className="hover:bg-[var(--p-surface-2)]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <AvatarAluno
                              student={s}
                              imageUrl={photoUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {s.name || "—"}
                              </div>
                              {s.email && (
                                <div className="text-xs text-[var(--p-text-muted)] truncate">
                                  {s.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 tabular-nums">
                          {fmtBRL(s.monthly_value)}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          dia {s.due_day ?? "—"}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {formatBirth(s.birth_date)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`p-chip ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => setEditTarget(s)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <Link
                              href={`/alunos/${s.id}/evolucao`}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                              aria-label="Evolução"
                              title="Evolução"
                            >
                              <TrendingUp className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => onToggleStatus(s)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                              aria-label={
                                s.status === "ativo" ? "Inativar" : "Ativar"
                              }
                              title={
                                s.status === "ativo" ? "Inativar" : "Ativar"
                              }
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setToDelete(s)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                              aria-label="Remover"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista mobile */}
            <ul className="divide-y divide-[var(--p-border)] md:hidden">
              {filtered.map((s) => {
                const { cls, icon: Icon, label } = statusChip(s.status);
                const photoPath = String(s.photo_url || "").trim();
                const photoUrl = photoPath ? signedMap[photoPath] : null;
                return (
                  <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                    <AvatarAluno
                      student={s}
                      imageUrl={photoUrl}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {s.name || "—"}
                          </div>
                          <div className="text-xs text-[var(--p-text-muted)] truncate">
                            {s.email || `Nasc.: ${formatBirth(s.birth_date)}`}
                          </div>
                        </div>
                        <span className={`p-chip ${cls} shrink-0`}>
                          <Icon className="h-3 w-3" /> {label}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-[var(--p-text-muted)]">
                        {fmtBRL(s.monthly_value)}/mês · venc. dia{" "}
                        {s.due_day ?? "—"}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => setEditTarget(s)}
                          className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            router.push(`/alunos/${s.id}/evolucao`)
                          }
                          className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                          aria-label="Evolução"
                        >
                          <TrendingUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onToggleStatus(s)}
                          className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                          aria-label={
                            s.status === "ativo" ? "Inativar" : "Ativar"
                          }
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setToDelete(s)}
                          className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {filtered.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
                  <Users className="h-5 w-5" />
                </div>
                <div className="text-sm font-medium">
                  Nenhum aluno encontrado
                </div>
                <div className="text-xs text-[var(--p-text-muted)]">
                  {q ? "Tente ajustar a busca." : "Nenhum aluno neste filtro."}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="text-xs text-[var(--p-text-muted)]">
          Mostrando {filtered.length} de {counts.todos}
        </div>
      )}

      {/* Modais */}
      {createOpen && (
        <StudentFormModal
          mode="create"
          payers={payers}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}

      {editTarget && (
        <StudentFormModal
          mode="edit"
          initial={editTarget}
          payers={payers}
          signedUrlOf={(p) => signedMap[String(p || "").trim()]}
          requestSignedUrl={getSignedUrl}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await load();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title="Remover aluno"
          itemName={toDelete.name}
          description="Lançamentos NÃO pagos serão removidos. Lançamentos pagos serão mantidos para contabilidade."
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteStudent(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal: Cadastrar / Editar aluno ─────────────────────────────
function StudentFormModal({
  mode,
  initial,
  payers,
  signedUrlOf,
  requestSignedUrl,
  onClose,
  onSaved,
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    monthly_value: String(initial?.monthly_value ?? ""),
    due_day: String(initial?.due_day ?? "10"),
    birth_date: initial?.birth_date || "",
    email: initial?.email || "",
    endereco: initial?.endereco || "",
    cpf: initial?.cpf || "",
  }));
  const [payerMode, setPayerMode] = useState(
    initial?.payer_id ? PAYER_MODE.EXISTING : PAYER_MODE.SELF
  );
  const [payerId, setPayerId] = useState(initial?.payer_id || "");
  const [newPayer, setNewPayer] = useState({ name: "", email: "" });

  // Foto (somente edit)
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoPreviewIsObject, setPhotoPreviewIsObject] = useState(false);
  const [editPhotoPath] = useState(String(initial?.photo_url || "").trim());
  const [processingFile, setProcessingFile] = useState(false);

  // Confirmação de mudança de due_day
  const [confirmDueDay, setConfirmDueDay] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function processFile(file) {
    if (!file) {
      if (photoPreview && photoPreviewIsObject) URL.revokeObjectURL(photoPreview);
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoPreviewIsObject(false);
      return;
    }
    const isPdf = file.type === "application/pdf";
    const isImage = /^image\/(jpeg|png|webp)$/i.test(file.type || "");
    if (!isPdf && !isImage) {
      alert("Formato não suportado. Use JPEG/PNG/WebP ou PDF.");
      return;
    }
    if (file.size > 1024 * 1024) {
      alert(isPdf ? "PDF muito grande (máx. 1 MB)." : "Imagem muito grande (máx. 1 MB).");
      return;
    }
    if (photoPreview && photoPreviewIsObject) URL.revokeObjectURL(photoPreview);

    if (isPdf) {
      try {
        setProcessingFile(true);
        const { default: pdfjsLib } = await import("pdfjs-dist/build/pdf");
        const WORKER_VERSION = "4.4.168";
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${WORKER_VERSION}/pdf.worker.min.js`;
        const ab = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const target = 512;
        const scale = target / Math.max(baseViewport.width, baseViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.9)
        );
        if (!blob) throw new Error("Falha ao gerar imagem do PDF.");
        if (blob.size > 1024 * 1024) {
          alert(
            "Imagem gerada a partir do PDF ficou acima de 1 MB. Tente um PDF menor."
          );
          return;
        }
        const fileOut = new File([blob], "avatar.webp", { type: "image/webp" });
        const url = URL.createObjectURL(fileOut);
        setPhotoFile(fileOut);
        setPhotoPreview(url);
        setPhotoPreviewIsObject(true);
      } catch (e) {
        console.warn("PDF process fail:", e);
        alert("Falha ao processar PDF.");
      } finally {
        setProcessingFile(false);
      }
      return;
    }

    // Imagem: converter pra WebP até 512px
    if (!/image\/webp/i.test(file.type || "")) {
      try {
        setProcessingFile(true);
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = objUrl;
        });
        const maxSide = Math.max(img.width, img.height) || 1;
        const target = 512;
        const scale = Math.min(1, target / maxSide);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objUrl);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.9)
        );
        if (!blob) throw new Error("Falha ao converter imagem.");
        if (blob.size > 1024 * 1024) {
          alert("Imagem convertida ficou acima de 1 MB.");
          return;
        }
        const fileOut = new File([blob], "avatar.webp", { type: "image/webp" });
        const url = URL.createObjectURL(fileOut);
        setPhotoFile(fileOut);
        setPhotoPreview(url);
        setPhotoPreviewIsObject(true);
      } catch (e) {
        console.warn("Image process fail:", e);
        alert("Falha ao processar a imagem.");
      } finally {
        setProcessingFile(false);
      }
    } else {
      const url = URL.createObjectURL(file);
      setPhotoFile(file);
      setPhotoPreview(url);
      setPhotoPreviewIsObject(true);
    }
  }

  async function performSave(changes) {
    if (isEdit) {
      await financeGateway.updateStudent(initial.id, changes);
      if (photoFile) {
        try {
          const { data: tId, error: tErr } = await supabase.rpc(
            "current_tenant_id"
          );
          if (tErr || !tId) throw new Error("tenant_id indisponível");
          const mime = photoFile.type || "image/jpeg";
          const ext = mime.includes("webp")
            ? "webp"
            : mime.includes("png")
            ? "png"
            : "jpg";
          const path = `tenant/${tId}/students/${initial.id}.${ext}`;
          const up = await supabase.storage
            .from("student-photos")
            .upload(path, photoFile, { upsert: true, contentType: mime });
          if (up.error) throw up.error;
          const signed = await requestSignedUrl?.(path, { silent: true });
          if (!signed) throw new Error("Signed URL ausente após upload");
          await financeGateway.updateStudent(initial.id, { photo_url: path });
        } catch (e) {
          alert(`Falha ao enviar foto: ${e?.message || e}`);
        }
      }
    } else {
      await financeGateway.createStudent(changes);
    }
    await onSaved();
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setErr(null);
    const trimmed = form.name.trim();
    if (!trimmed) return setErr("Nome é obrigatório.");
    const dd = Number(form.due_day);
    if (!Number.isInteger(dd) || dd < 1 || dd > 28)
      return setErr("Dia de vencimento deve ser entre 1 e 28.");

    let chosenPayerId = null;
    try {
      setSaving(true);

      if (payerMode === PAYER_MODE.EXISTING) {
        if (!payerId)
          return setErr("Selecione um pagador existente.");
        chosenPayerId = payerId;
      } else if (payerMode === PAYER_MODE.NEW) {
        if (!newPayer.name.trim())
          return setErr("Informe o nome do novo pagador.");
        const py = await financeGateway.createPayer({
          name: newPayer.name.trim(),
          email: newPayer.email.trim() || null,
        });
        chosenPayerId = py.id;
      }

      const changes = {
        name: trimmed,
        monthly_value: Number(form.monthly_value || 0),
        due_day: dd,
        birth_date: form.birth_date || null,
        email: form.email || null,
        endereco: form.endereco || null,
        cpf: form.cpf || null,
        payer_id: chosenPayerId,
      };

      // Confirmação se due_day mudou (apenas em edit)
      if (isEdit) {
        const oldDueDay = initial?.due_day ?? null;
        if (oldDueDay != null && Number(oldDueDay) !== dd) {
          setPendingChanges(changes);
          setConfirmDueDay(true);
          setSaving(false);
          return;
        }
      } else {
        // create: status default
        changes.status = "ativo";
      }

      await performSave(changes);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmAndSave() {
    if (!pendingChanges) return;
    try {
      setSaving(true);
      await performSave(pendingChanges);
      setConfirmDueDay(false);
      setPendingChanges(null);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // Cleanup do object URL ao fechar
  useEffect(() => {
    return () => {
      if (photoPreview && photoPreviewIsObject)
        URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview, photoPreviewIsObject]);

  const initialPhotoUrl = editPhotoPath ? signedUrlOf?.(editPhotoPath) : null;
  const previewUrl = photoPreview || initialPhotoUrl || null;

  return (
    <>
      <AppModal
        title={isEdit ? "Editar aluno" : "Novo aluno"}
        onClose={saving ? () => {} : onClose}
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <FormError message={err} />

          <FormField
            label="Nome completo *"
            value={form.name}
            onChange={(v) => update("name", v)}
            placeholder="Ex.: Maria Silva"
            autoFocus
          />

          {isEdit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--p-text-muted)]">
                Foto do aluno (opcional)
              </label>
              <div className="flex items-center gap-3">
                <AvatarAluno
                  student={{ id: initial?.id, name: form.name }}
                  imageUrl={previewUrl || undefined}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      id="alunoFoto"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(e) => processFile(e.target.files?.[0])}
                    />
                    <label
                      htmlFor="alunoFoto"
                      className="cursor-pointer rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-xs hover:bg-[var(--p-surface-2)]"
                    >
                      {processingFile
                        ? "Processando…"
                        : photoFile
                        ? "Trocar arquivo"
                        : "Escolher arquivo"}
                    </label>
                    <span className="truncate text-xs text-[var(--p-text-muted)]">
                      {photoFile?.name || "Nenhum arquivo"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--p-text-faint)]">
                    JPEG/PNG/PDF serão convertidos para WebP até 1 MB.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Mensalidade (R$) *"
              type="number"
              min="0"
              step="0.01"
              value={form.monthly_value}
              onChange={(v) => update("monthly_value", v)}
              placeholder="0,00"
            />
            <FormField
              label="Dia de vencimento (1–28) *"
              type="number"
              min="1"
              max="28"
              value={form.due_day}
              onChange={(v) => update("due_day", v)}
            />
          </div>

          <FormField
            label="Data de nascimento"
            type="date"
            value={form.birth_date}
            onChange={(v) => update("birth_date", v)}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(v) => update("email", v)}
              placeholder="aluno@exemplo.com"
            />
            <FormField
              label="CPF"
              value={form.cpf}
              onChange={(v) => update("cpf", v)}
              placeholder="000.000.000-00"
            />
          </div>

          <FormField
            label="Endereço"
            value={form.endereco}
            onChange={(v) => update("endereco", v)}
          />

          {/* Pagador */}
          <div className="border-t border-[var(--p-border)] pt-4">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Pagador
            </span>
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="payerMode"
                  checked={payerMode === PAYER_MODE.SELF}
                  onChange={() => setPayerMode(PAYER_MODE.SELF)}
                />
                <span>Próprio aluno</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="payerMode"
                  checked={payerMode === PAYER_MODE.EXISTING}
                  onChange={() => setPayerMode(PAYER_MODE.EXISTING)}
                />
                <span>Selecionar existente</span>
              </label>
              {payerMode === PAYER_MODE.EXISTING && (
                <select
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                >
                  <option value="">— escolha um pagador —</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.email ? `— ${p.email}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="payerMode"
                  checked={payerMode === PAYER_MODE.NEW}
                  onChange={() => setPayerMode(PAYER_MODE.NEW)}
                />
                <span>Criar novo pagador</span>
              </label>
              {payerMode === PAYER_MODE.NEW && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Nome do pagador*"
                    value={newPayer.name}
                    onChange={(e) =>
                      setNewPayer((n) => ({ ...n, name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                  />
                  <input
                    placeholder="E-mail (opcional)"
                    type="email"
                    value={newPayer.email}
                    onChange={(e) =>
                      setNewPayer((n) => ({ ...n, email: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                  />
                </div>
              )}
            </div>
          </div>

          <ModalActions
            onCancel={onClose}
            submitting={saving || processingFile}
            submitLabel={isEdit ? "Salvar" : "Cadastrar"}
          />
        </form>
      </AppModal>

      {/* Confirmação de mudança de due_day */}
      {confirmDueDay && (
        <AppModal
          title="Confirmar alteração do dia de vencimento"
          onClose={saving ? () => {} : () => setConfirmDueDay(false)}
          maxWidth="sm"
        >
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-sm text-[var(--p-text-muted)]">
              Esta mudança vale <b>apenas para cobranças futuras</b>. As
              mensalidades <b>já geradas não serão atualizadas
              automaticamente</b>.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmDueDay(false)}
                disabled={saving}
                className="p-btn p-btn-ghost"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAndSave}
                disabled={saving}
                className="p-btn p-btn-primary"
              >
                {saving ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </AppModal>
      )}
    </>
  );
}

// ─── Form field reusable ─────────────────────────────────────────
function FormField({
  label,
  value,
  type = "text",
  onChange,
  placeholder,
  autoFocus,
  min,
  max,
  step,
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </label>
  );
}
