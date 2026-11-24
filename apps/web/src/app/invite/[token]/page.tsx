import type { Metadata } from "next";
import InviteScreen from "@/components/home/InviteScreen";

// The secret is in the address: never pass it on to another site through the Referer header
export const metadata: Metadata = {
  title: "Invitation | SceneRoom",
  referrer: "no-referrer",
};

/** The page an invitation link opens. The secret in the address says which invitation. */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteScreen token={token} />;
}
