import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, fullName, company, role, teamSize, industry, interests, budget, useCase, website } = body;

    if (!email || !fullName || !company || !role || !teamSize) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("enterprise_leads").insert({
      email,
      full_name: fullName,
      company,
      role,
      team_size: teamSize,
      industry: industry || null,
      interests: interests || [],
      budget: budget || null,
      use_case: useCase || null,
      website: website || null,
    });

    if (error) {
      // Duplicate email
      if (error.code === "23505") {
        return NextResponse.json({ error: "You have already applied. We'll be in touch." }, { status: 409 });
      }
      console.error("Insert error:", error);
      return NextResponse.json({ error: "Failed to save application" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Apply error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
