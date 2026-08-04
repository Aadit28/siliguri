import { NextResponse } from "next/server";

const ROLES = ["family", "elder", "partner", "city"] as const;
type Role = (typeof ROLES)[number];

const LANGS = ["en", "hi", "mr"] as const;
type Lang = (typeof LANGS)[number];

type Payload = {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  city?: unknown;
  lang?: unknown;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = ROLES.includes(body.role as Role) ? (body.role as Role) : null;
  const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
  const lang = LANGS.includes(body.lang as Lang) ? (body.lang as Lang) : "en";

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Please enter your name." },
      { status: 422 },
    );
  }
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "That email address does not look right." },
      { status: 422 },
    );
  }
  if (!role) {
    return NextResponse.json(
      { error: "Please tell us who this is for." },
      { status: 422 },
    );
  }
  // A city request with no city named is the one combination that carries no
  // information at all, so it is rejected rather than stored empty.
  if (role === "city" && city.length < 2) {
    return NextResponse.json(
      { error: "Please tell us which city." },
      { status: 422 },
    );
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // No storage configured. In development that is expected and the form stays
  // usable; in production it is a deployment mistake and must surface as one
  // rather than silently dropping a signup on the floor.
  if (!url || !key) {
    if (process.env.NODE_ENV === "production") {
      console.error("waitlist: SUPABASE_URL / SERVICE_ROLE_KEY are not set");
      return NextResponse.json(
        { error: "Signups are temporarily unavailable. Please try later." },
        { status: 503 },
      );
    }
    console.warn("waitlist: no storage configured, discarding", {
      email,
      role,
      city,
      lang,
    });
    return NextResponse.json({ ok: true, stored: false });
  }

  const response = await fetch(`${url}/rest/v1/landing_waitlist`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      name,
      email,
      role,
      city: city || null,
      lang,
      source: "landing",
    }),
  });

  if (!response.ok) {
    console.error(
      "waitlist: insert failed",
      response.status,
      await response.text(),
    );
    return NextResponse.json(
      { error: "We could not save that. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, stored: true });
}
