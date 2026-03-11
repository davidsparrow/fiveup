"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function cleanMessage(message) {
  return encodeURIComponent(message);
}

function getSafeNextPath(rawNext) {
  if (typeof rawNext !== "string" || !rawNext.startsWith("/")) {
    return "/account";
  }

  return rawNext;
}

export async function signIn(formData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafeNextPath(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${cleanMessage(error.message)}&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(nextPath);
}

export async function signUp(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafeNextPath(formData.get("next"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { full_name: name } : undefined,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    redirect(`/signup?error=${cleanMessage(error.message)}&next=${encodeURIComponent(nextPath)}`);
  }

  if (data.session) {
    redirect(nextPath);
  }

  redirect(`/signup?message=${cleanMessage("Check your email for the confirmation link, then come back here to log in.")}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=Signed%20out%20successfully.");
}