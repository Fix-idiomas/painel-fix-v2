import { NextResponse } from "next/server";

export async function POST(req) {
  // (futuro) validar email/senha
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set("auth", "1", { path: "/", httpOnly: true });
  return res;
}
