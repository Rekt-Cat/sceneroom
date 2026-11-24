import { headers } from "next/headers";
import { getAccounts } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/** Who is signed in for this request, or null (not signed in, or accounts are not set up). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accounts = getAccounts();
  if (!accounts) return null;
  const session = await accounts.auth.api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}
