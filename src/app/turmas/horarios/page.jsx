"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];
const labelWD = (n) => WEEKDAYS.find(w => w.value === Number(n))?.label || "—";

export default function TurmaHorariosPage() {
  const params = useParams();
  const router = useRouter();
  const turmaId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [turma, setTurma] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  // modal create/edit
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    weekday: 1,
    start_time: "08:00",
    duration_hours: "0.5",
    room: "",
    active: true,
  });

  // gerar sessões
  const [openGen, setOpenGen] = useState(false);
  const [range, setRange] = useState({ start: "", end: "" });
  const [preview, setPreview] = useState([]);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [turmas, sch] = await Promise.all([
      financeGateway.listTurmas(),
      financeGateway.listSchedules(turmaId),
    ]);
    const t = turmas.find(x => x.id === turmaId);
    if (!t) { alert("Turma não encontrada"); router.push("/turmas"); return; }
    setTurma(t);
    setSchedules(sch);
    setLoading(false);
  }

  useEffect(() => { if (turmaId) loadAll(); }, [turmaId]);

  function openCreate() {
    setEditingId(null);
    setForm({ weekday: 1, start_time: "08:00", duration_hours: "0.5", room: "", active: true });
    setOpenEdit(true);
  }
  function openEditSchedule(s) {
    setEditingId(s.id);
    setForm({
      weekday: String(s.weekday),
      start_time: s.start_time || "08:00",
      duration_hours: String(s.duration_hours ?? "0.5"),
      room: s.room || "",
      active: !!s.active,
    });
    setOpenEdit(true);
  }
  async function onSubmitSchedule(e) {
    e?.preventDefault?.();
    try {
      setSaving(true);
      const payload = {
        weekday: Number(form.weekday),
        start_time: form.start_time,
        duration_hours: Number(form.duration_hours || 0.5),
        room: form.room?.trim() || null,
        active: !!form.active,
      };
      if (editingId) await financeGateway.updateSchedule(editingId, payload);
      else await financeGateway.createSchedule({ turma_id: turma.id, ...payload });
      setOpenEdit(false);
      await loadAll();
    } catch (err) { alert(err.message || String(err)); }
    finally { setSaving(false); }
  }
  async function onDeleteSchedule(s) {
    if (!confirm("Excluir horário?")) return;
    await financeGateway.deleteSchedule(s.id);
    await loadAll();
  }

  async function onPreviewGenerate() {
    if (!range.start || !range.end) { alert("Informe o período."); return; }
    setLoadingPrev(true);
    try {
      const prev = await financeGateway.previewGenerateSessionsFromSchedules({
        turma_id: turma.id,
        start_date: range.start,
        end_date: range.end,
      });
      setPreview(prev);
    } catch (e) { alert(e.message || String(e)); }
    finally { setLoadingPrev(false); }
  }
  async function onGenerate() {
    if (!range.start || !range.end) { alert("Informe o período."); return; }
    setGenerating(true);
    try {
      await financeGateway.generateSessionsFromSchedules({
        turma_id: turma.id,
        start_date: range.start,
        end_date: range.end,
      });
      alert("Sessões geradas (novas) com sucesso.");
      setOpenGen(false);
    } catch (e) { alert(e.message || String(e)); }
    finally { setGenerating(false); }
  }

  if (loading) return <main className="p-6">Carregando…</main>;
  if (!turma) return null;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{turma.name} — Horários</h1>
          <div className="text-slate-600">Gerencie os horários semanais desta turma e gere sessões automaticamente.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>history.back()} className="border rounded px-3 py-2">Voltar</button>
          <button onClick={()=>setOpenGen(true)} className="border rounded px-3 py-2">Gerar sessões</button>
          <button onClick={openCreate} className="border rounded px-3 py-2">+ Novo horário</button>
        </div>
      </div>

      <section className="border rounded overflow-hidden">
        <div className="p-3 border-b font-semibold">Horários semanais</div>
        {schedules.length === 0 ? (
          <div className="p-4">Nenhum horário cadastrado.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Dia</Th>
                <Th>Início</Th>
                <Th>Duração</Th>
                <Th>Sala</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s=>(
                <tr key={s.id} className="border-t">
                  <Td>{labelWD(s.weekday)}</Td>
                  <Td>{s.start_time}</Td>
                  <Td>{(Number(s.duration_hours)||0).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:2})} h</Td>
                  <Td>{s.room || "-"}</Td>
                  <Td>{s.active ? "ativo" : "inativo"}</Td>
                  <Td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={()=>openEditSchedule(s)} className="px-2 py-1 border rounded">Editar</button>
                      <button onClick={()=>onDeleteSchedule(s)} className="px-2 py-1 border rounded">Excluir</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal criar/editar horário */}
      <Modal
        open={openEdit}
        onClose={()=>setOpenEdit(false)}
        title={editingId ? "Editar horário" : "Novo horário"}
        footer={
          <>
            <button onClick={()=>setOpenEdit(false)} className="px-3 py-2 border rounded">Cancelar</button>
            <button onClick={onSubmitSchedule} disabled={saving} className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50">
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitSchedule} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">Dia da semana</label>
            <select
              value={form.weekday}
              onChange={(e)=>setForm(f=>({...f, weekday:e.target.value}))}
              className="border rounded px-3 py-2 w-full"
            >
              {WEEKDAYS.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Início</label>
            <input
              type="time"
              value={form.start_time}
              onChange={(e)=>setForm(f=>({...f, start_time:e.target.value}))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Duração (h)</label>
            <select
              value={form.duration_hours}
              onChange={(e)=>setForm(f=>({...f, duration_hours:e.target.value}))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="0.5">0,5 h</option>
              <option value="1">1 h</option>
              <option value="1.5">1,5 h</option>
              <option value="2">2 h</option>
              <option value="2.5">2,5 h</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Sala (opcional)</label>
            <input
              value={form.room}
              onChange={(e)=>setForm(f=>({...f, room:e.target.value}))}
              className="border rounded px-3 py-2 w-full"
              placeholder="ex: A-02"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e)=>setForm(f=>({...f, active:e.target.checked}))}/>
              <span>Ativo</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Modal gerar sessões */}
      <Modal
        open={openGen}
        onClose={()=>setOpenGen(false)}
        title="Gerar sessões por período"
        footer={
          <>
            <button onClick={()=>setOpenGen(false)} className="px-3 py-2 border rounded">Fechar</button>
            <button onClick={onGenerate} disabled={generating} className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50">
              {generating ? "Gerando…" : "Gerar sessões"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm mb-1">Início</label>
            <input type="date" value={range.start} onChange={(e)=>setRange(r=>({...r, start:e.target.value}))}
                   className="border rounded px-3 py-2 w-full"/>
          </div>
          <div>
            <label className="block text-sm mb-1">Fim</label>
            <input type="date" value={range.end} onChange={(e)=>setRange(r=>({...r, end:e.target.value}))}
                   className="border rounded px-3 py-2 w-full"/>
          </div>
          <div className="flex items-end">
            <button onClick={onPreviewGenerate} className="border rounded px-3 py-2 w-full">Prévia</button>
          </div>
        </div>

        <div className="mt-4 border rounded overflow-auto max-h-80">
          <div className="p-2 border-b text-sm font-medium">Prévia</div>
          {loadingPrev ? (
            <div className="p-3">Carregando prévia…</div>
          ) : preview.length === 0 ? (
            <div className="p-3 text-sm">Sem itens para este período.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Data</Th>
                  <Th>Início</Th>
                  <Th>Duração</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i)=>(
                  <tr key={i} className="border-t">
                    <Td>{p.date}</Td>
                    <Td>{p.start_time}</Td>
                    <Td>{(Number(p.duration_hours)||0).toLocaleString("pt-BR",{minimumFractionDigits:1, maximumFractionDigits:2})} h</Td>
                    <Td>{p.exists ? "já existe" : "novo"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </main>
  );
}

function Th({ children }) { return <th className="text-left px-3 py-2 font-medium">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-2">{children}</td>; }
