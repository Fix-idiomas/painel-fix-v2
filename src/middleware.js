// src/middleware.js
// Middleware robusto: usa cookies de sessão (auth-helpers) para proteger rotas.
// Regras principais:
//  - '/' → se autenticado vai para '/recepcao', senão '/login'
//  - '/login' autenticado → '/recepcao'
//  - Rotas privadas sem sessão → '/login?next=<rota>'
//  - Exclui estáticos e /api do matcher para performance
//  - Usa createMiddlewareClient para refresh silencioso do token
import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req) {
  const res = NextResponse.next();
  const { pathname, searchParams } = req.nextUrl;

  // Ignora explicitamente assets já filtrados pelo matcher (defensive)
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
    return res;
  }

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Root: decide destino em uma única passada (evita duplo redirect)
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session ? '/recepcao' : '/login';
    return NextResponse.redirect(url);
  }

  // Público (acesso livre)
  const isPublic =
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/(auth)') || // diretório de auth
    pathname.startsWith('/assets/') ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|map)$/.test(pathname);

  // Já autenticado acessando /login → manda para home autenticada
  if (session && pathname === '/login') {
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
