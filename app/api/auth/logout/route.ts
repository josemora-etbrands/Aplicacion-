import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete(COOKIE);
  return NextResponse.json({ success: true });
}
