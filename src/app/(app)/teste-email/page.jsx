"use client";

import { useState } from "react";

export default function TesteEmailPage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Teste de envio");
  const [message, setMessage] = useState("Olá! Este é um e-mail de teste via Mailgun.");
  const [sending, setSending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      setSending(true);
      const res = await fetch("/api/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          html: `<p>${message.replace(/\n/g, "<br/>")}</p>`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao enviar");
      alert("E-mail enviado! id: " + (data?.id || "ok"));
      setTo("");
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Teste de E-mail</h1>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div>
          <label className="block text-sm mb-1">Para* (separe por vírgula)</label>
          <input
            value={to}
            onChange={(e)=>setTo(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            placeholder="destino@ex.com, outro@ex.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Assunto*</label>
          <input
            value={subject}
            onChange={(e)=>setSubject(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Mensagem*</label>
          <textarea
            value={message}
            onChange={(e)=>setMessage(e.target.value)}
            className="border rounded px-3 py-2 w-full"
            rows={8}
            required
          />
        </div>

        <div className="flex gap-2">        
          <button
            type="submit"
            className="border rounded px-3 py-2 bg-rose-600 text-white disabled:opacity-50"
            disabled={sending}
          >
            {sending ? "Enviando…" : "Enviar e-mail"}
          </button>
          <a href="/" className="border rounded px-3 py-2">Voltar</a>
        </div>
      </form>
    </main>
  );
}
