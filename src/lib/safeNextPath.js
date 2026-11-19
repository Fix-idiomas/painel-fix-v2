// Sanitiza o parâmetro ?next= do login para impedir open redirect.
// Aceita só caminhos internos absolutos ("/alunos?x=1"). Qualquer coisa que o
// navegador interpretaria como outra origem ("//evil.com", "/\evil.com",
// "https://evil.com", "javascript:...") cai no fallback.

const FALLBACK = "/recepcao";

/**
 * @param {string|null|undefined} next
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeNextPath(next, fallback = FALLBACK) {
  if (typeof next !== "string") return fallback;
  const s = next.trim();
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("//") || s.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(s)) return fallback; // controle/backslash em qualquer posição
  return s;
}
