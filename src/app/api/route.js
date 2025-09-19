// src/app/api/route.js
import { NextResponse } from "next/server";

/**
 * Este endpoint foi descontinuado.
 * Motivo: novo fluxo em que o admin cria usuário já confirmado com senha.
 * Use: POST /api/admin/create-user
 */
export async function POST() {
  return NextResponse.json(
    { error: "Endpoint descontinuado. Use /api/admin/create-user." },
    { status: 410 } // Gone
  );
}

// Opcional: bloquear GET também para evitar confusão
export async function GET() {
  return NextResponse.json(
    { error: "Endpoint descontinuado. Use /api/admin/create-user." },
    { status: 410 }
  );
}
