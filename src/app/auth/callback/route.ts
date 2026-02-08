import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const redirectUrl = new URL("/auth", req.nextUrl.origin);

  if (token_hash && type === "email") {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: "email",
    });

    if (error || !data.user) {
      redirectUrl.searchParams.set("error", "Verification failed. Please try again.");
      return NextResponse.redirect(redirectUrl);
    }

    // Create/update the profile after email verification
    await supabaseAdmin.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || null,
    });

    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      redirectUrl.searchParams.set("error", "Verification failed. Please try again.");
      return NextResponse.redirect(redirectUrl);
    }

    await supabaseAdmin.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || null,
    });

    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set("error", "Invalid verification link.");
  return NextResponse.redirect(redirectUrl);
}
