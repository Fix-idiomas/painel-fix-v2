import { NextResponse } from "next/server";

export async function POST(req) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("auth", "", { path: "/", httpOnly: true, maxAge: 0 });
  return res;
}
