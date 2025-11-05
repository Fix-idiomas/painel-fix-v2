  // middleware.js
  import { NextResponse } from "next/server";
  import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

  export async function middleware(req) {
    const res = NextResponse.next();

    console.log({ res });

    const { pathname, search } = req.nextUrl;
     // 🔒 Regra canônica: qualquer acesso à raiz vai para /login
   // (independente de sessão; mantém /login como ponto de entrada explícito)
   if (pathname === "/") {
     const url = req.nextUrl.clone();
     url.pathname = "/login";
     return NextResponse.redirect(url);
   }

    // Rotas públicas (ajuste se necessário)
    const isPublic =
      pathname === "/login" ||
      pathname.startsWith("/_next") ||
      pathname === "/favicon.ico" ||
      pathname.startsWith("/api/") || // geralmente públicas (ajuste se tiver APIs privadas)
      pathname.startsWith("/assets/") ||
      pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|txt|map)$/);

    // Checa sessão do Supabase
    const supabase = createMiddlewareClient({ req, res });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    console.log({ isPublic, session });

    // Sem sessão e rota privada -> manda para /login
    if (!session && !isPublic) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      // preserva rota de destino
      const next = pathname + (search || "");
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }

    // Já autenticado tentando acessar /login -> manda para a home do app
    if (session && pathname === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/recepcao"; // ajuste sua “home” autenticada
      return NextResponse.redirect(url);
    }

    return res;
  }

  // Aplica a tudo, exceto estáticos do Next e favicon
  export const config = {
    matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
  };