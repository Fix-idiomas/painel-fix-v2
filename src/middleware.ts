// src/middleware.js
// Middleware robusto: usa cookies de sessão (auth-helpers) para proteger rotas.
// Regras principais:
//  - '/' → se autenticado vai para '/recepcao', senão '/login'
//  - '/login' autenticado → '/recepcao'
//  - Rotas privadas sem sessão → '/login?next=<rota>'
//  - Exclui estáticos e /api do matcher para performance
//  - Usa createMiddlewareClient para refresh silencioso do token
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

// Rotas de debug/dev que não devem ser acessíveis em produção.
const DEV_ONLY_PREFIXES = ['/debug-jwt', '/debug-payments', '/debug/', '/dev/'];

// Rotas de preview (redesign) — em produção, liberadas apenas para emails da allowlist.
const PREVIEW_PREFIXES = ['/preview/', '/preview'];
const PREVIEW_ALLOWED_EMAILS = new Set([
  'vini.penteado.n@gmail.com',
  'brunomesmo@hotmail.com',
  'prafalarcombruno@gmail.com',
  'bcsmonteiro@unifesp.br',
  'bruno@fixidiomas.com.br',
]);

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Ignora explicitamente assets já filtrados pelo matcher (defensive)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
    return res;
  }

  // Bloqueia rotas de debug em produção (NODE_ENV === 'production' cobre
  // tanto deploys de produção quanto de preview no Vercel).
  if (
    process.env.NODE_ENV === 'production' &&
    DEV_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // /preview/* em produção: só libera para emails da allowlist (valida via sessão).
  const isPreviewPath = PREVIEW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (process.env.NODE_ENV === 'production' && isPreviewPath) {
    const email = session?.user?.email?.toLowerCase() || '';
    if (!email || !PREVIEW_ALLOWED_EMAILS.has(email)) {
      return new NextResponse(null, { status: 404 });
    }
  }

  // Público (acesso livre)
  const isPublic =
    pathname === '/' ||           // landing page pública
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/(auth)') || // diretório de auth (grupos não aparecem na URL real)
    pathname.startsWith('/assets/') ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|map)$/.test(pathname);

  // Já autenticado acessando /login ou /signup → manda para home autenticada
  if (session && (pathname === '/login' || pathname === '/signup')) {
    const url = req.nextUrl.clone();
    url.pathname = '/recepcao';
    return NextResponse.redirect(url);
  }

  // Privado sem sessão → redireciona preservando destino
  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // next = rota original + query string
    const nextTarget = pathname + (req.nextUrl.search || '');
    url.searchParams.set('next', nextTarget);
    return NextResponse.redirect(url);
  }

  return res; // segue normalmente
}

// Matcher: inclui tudo menos _next, api e arquivos estáticos comuns.
// Padrão negative lookahead para performance.
export const config = {
  matcher: [
    '/',
    '/((?!_next/|api/|favicon.ico|.*\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|map)).*)',
  ],
};
