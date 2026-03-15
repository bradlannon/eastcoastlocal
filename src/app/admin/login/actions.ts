"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH,
  SESSION_COOKIE_NAME,
  SESSION_DURATION,
  signToken,
  verifyPassword,
} from "@/lib/auth";

export async function login(
  formData: FormData
): Promise<{ error?: string }> {
  const email = (formData.get("email") as string | null) ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  const emailMatch =
    email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
  const passwordValid = await verifyPassword(password, ADMIN_PASSWORD_HASH);

  if (!emailMatch || !passwordValid) {
    return { error: "Invalid email or password" };
  }

  const token = await signToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });

  redirect("/admin");
}
