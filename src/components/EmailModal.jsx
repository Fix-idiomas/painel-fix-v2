"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

export default function EmailModal({ open, onClose, defaultTo = "", defaultSubject = "", defaultHtml = "" }) {
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [html, setHtml] = useState(defaultHtml);
  const [text, setText] = useState("");
  const [copyMe, setCopyMe] = useState(false);

  async function onSend(e) {
    e?.preventDefault?.();
    try {
      setSending(true);
      const recipients = to
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (recipients.length === 0) throw new Error("Informe pelo menos 1 destinatário.");

      // dispara 1 a 1 (mantém simples; se preferir, pode criar um /api/send-bulk)
      for (const rcpt of recipients) {
        const res = await fetch("/api/send-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: rcpt,
            subject,
            html,
            text: text || stripHtml(html),
            // Se quiser forçar o From Name ao invés do env, descomente:
            // fromName: "Fix Idiomas"
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Falha ao enviar para " + rcpt);
        }
      }

      // cópia para você
      if (copyMe) {
        await fetch("/api/send-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "", // deixe vazio se sua rota usa um TO_DEFAULT no server; se não, informe seu e-mail aqui
            subject: `[Cópia] ${subject}`,
            html,
            text: text || stripHtml(html),
          }),
        });
      }

      alert("E-mail(s) enviado(s) com sucesso!");
      onClose?.();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !sending && onClose?.()}
      title="Enviar e-mail"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 border rounded disabled:opacity-50" disabled={sending}>
            Cancelar
          </button>
          <button
            onClick={onSend}
            className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
            disabled={sending}
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </>
      }
    >
      <form onSubmit={onSend} className="grid gap-3">
        <div>
          <label className="block text-sm mb-1">Para* (separe por vírgula)</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            placeholder="aluno1@email.com, aluno2@email.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Assunto*</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Corpo (HTML)*</label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="border rounded px-3 py-2 w-full font-mono"
            rows={10}
            placeholder={`<div style="font-family:Arial"><h2>Olá!</h2><p>Mensagem em <b>HTML</b>.</p></div>`}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Versão em texto (opcional)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            rows={4}
            placeholder="Mensagem sem formatação (para clientes que não leem HTML)."
          />
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
          <span>Enviar cópia para mim</span>
        </label>
      </form>
    </Modal>
  );
}

function stripHtml(h) {
  if (!h) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = h;
  return (tmp.textContent || tmp.innerText || "").trim();
}
