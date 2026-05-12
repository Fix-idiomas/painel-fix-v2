"use client";
import Image from "next/image";

export default function InicioPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white text-center p-6">
      {/* Container COM altura/largura definidas (evita height=0) */}
      <div className="relative h-40 w-40 sm:h-56 sm:w-56 md:h-64 md:w-64">
        <Image
          src="/logo.png"
          alt="Logo"
          fill
          // sizes obrigatório quando usa fill (melhora performance)
          sizes="(max-width: 640px) 10rem, (max-width: 768px) 14rem, 16rem"
          style={{ objectFit: "contain" }} // mantém proporção sem cortar
          priority
        />
      </div>

      <h1 className="mt-6 text-3xl font-bold text-slate-900">
        Bem-vindo ao Painel
      </h1>
      <p className="mt-2 text-slate-600">Desejamos um excelente trabalho!</p>
    </main>
  );
}