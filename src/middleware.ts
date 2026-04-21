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

  // Raiz: se autenticado, permanece em '/'; se não, vai para login preservando next
  if (pathname === '/') {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', '/');
      return NextResponse.redirect(url);
    }
    return res;
  }

  // Público (acesso livre)
  const isPublic =
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
