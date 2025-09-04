export async function sendMail({ to, subject, html, text }) {
  const res = await fetch("/api/send-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Erro ao enviar e-mail");
  return data;
}
