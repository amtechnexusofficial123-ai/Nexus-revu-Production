import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { hashPassword, createSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const existing = await db.select().from(admins).where(eq(admins.email, email));
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const [admin] = await db.insert(admins).values({ email, passwordHash }).returning();

  await createSession(admin.id);

  return NextResponse.json({ admin: { id: admin.id, email: admin.email } });
}
