// src/lib/sendMailClient.js
export async function sendMail({ to, subject, text, html, cc, bcc, replyTo }) {
  const res = await fetch("/api/send-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, text, html, cc, bcc, replyTo }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Falha ao enviar e-mail (${res.status})`);
  }
  return data.result;
}
