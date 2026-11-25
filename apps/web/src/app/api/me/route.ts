import { getAccounts } from "@/server/auth";
import { getCurrentUser } from "@/server/session";

export const runtime = "nodejs";

/** Who is signed in: 200 with the person, 401 when nobody is, 503 when accounts are not set up. Never cached. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!getAccounts()) {
    return Response.json(
      { error: "Accounts are not set up on this server." },
      { status: 503, headers },
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in." }, { status: 401, headers });
  }
  return Response.json(
    { id: user.id, name: user.name, image: user.image },
    { headers },
  );
}
