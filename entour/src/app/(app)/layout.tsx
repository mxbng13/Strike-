import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { AccountBanners } from "@/components/account-banners";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return (
    <AppShell>
      <AccountBanners />
      {children}
    </AppShell>
  );
}
