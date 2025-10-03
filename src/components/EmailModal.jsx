  "use client";

  import { useEffect, useId, useState } from "react";
  import Modal from "@/components/Modal";

  export default function EmailModal({
    open,
    onClose,
    defaultTo = "",
    defaultSubject = "",
    defaultHtml = "",
  }) {
    const [sending, setSending] = useState(false);
    const [to, setTo] = useState(defaultTo);
    const [subject, setSubject] = useState(defaultSubject);
    const [html, setHtml] = useState(defaultHtml);
    const [text, setText] = useState("");
    const [copyMe, setCopyMe] = useState(false);

    // mantém defaults atualizados ao reabrir
    useEffect(() => {
      if (open) {
        setTo(defaultTo || "");
        setSubject(defaultSubject || "");
        setHtml(defaultHtml || "");
        setText("");
        setCopyMe(false);
      }
    }, [open, defaultTo, defaultSubject, defaultHtml]);

    const formId = useId();

    async function handleSubmit(e) {
      e.preventDefault();

      // normaliza destinatários
      const recipients = String(to)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (recipients.length === 0) {
        alert("Informe pelo menos 1 destinatário.");
        return;
      }
      if (!subject.trim()) {
        alert("Informe o assunto.");
        return;
      }
      if (!html.trim() && !text.trim()) {
        alert("Informe o corpo do e-mail (HTML ou texto).");
        return;
      }

      try {
        setSending(true);

        for (const rcpt of recipients) {
          const res = await fetch("/api/send-mail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: rcpt,
              subject,
              html,
              text: text || stripHtml(html),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `Falha ao enviar para ${rcpt}`);
          }
        }

        if (copyMe) {
          await fetch("/api/send-mail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: "", // preencha no server se tiver TO_DEFAULT; senão, informe seu e-mail aqui
              subject: `[Cópia] ${subject}`,
              html,
              text: text || stripHtml(html),
            }),
          }).catch(() => {});
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
        onClose={() => (!sending ? onClose?.() : null)}
        title="Enviar e-mail"
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={sending}
            >
              Cancelar
            </button>

            {/* associa ao form pelo atributo form */}
            <button
              type="submit"
              form={formId}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              disabled={sending}
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className="grid gap-3">
          <div>
            <label htmlFor={`${formId}-to`} className="block text-sm mb-1">
              Para* (separe por vírgula)
            </label>
            <input
              id={`${formId}-to`}
              name="to"
              type="text"
              autoComplete="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              placeholder="aluno1@email.com, aluno2@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor={`${formId}-subject`} className="block text-sm mb-1">
              Assunto*
            </label>
            <input
              id={`${formId}-subject`}
              name="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label htmlFor={`${formId}-html`} className="block text-sm mb-1">
              Corpo (HTML)*
            </label>
            <textarea
              id={`${formId}-html`}
              name="html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="border rounded px-3 py-2 w-full font-mono"
              rows={10}
              placeholder={`<div style="font-family:Arial"><h2>Olá!</h2><p>Mensagem em <b>HTML</b>.</p></div>`}
              required={!text}
            />
          </div>

          <div>
            <label htmlFor={`${formId}-text`} className="block text-sm mb-1">
              Versão em texto (opcional)
            </label>
            <textarea
              id={`${formId}-text`}
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              rows={4}
              placeholder="Mensagem sem formatação (para clientes que não leem HTML)."
              required={!html}
            />
          </div>

          <label className="inline-flex items-center gap-2">
            <input
              id={`${formId}-copyMe`}
              name="copyMe"
              type="checkbox"
              checked={copyMe}
              onChange={(e) => setCopyMe(e.target.checked)}
            />
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
