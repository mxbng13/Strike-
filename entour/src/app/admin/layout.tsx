import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";
import { can, getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Administration" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/admin");
  if (!can(user.adminRole, "dashboard.view")) redirect("/accueil");
  const perms = {
    users: can(user.adminRole, "users.view"),
    moderation: can(user.adminRole, "services.moderate") || can(user.adminRole, "users.verify"),
    reports: can(user.adminRole, "reports.handle"),
    disputes: can(user.adminRole, "disputes.handle"),
    catalog: can(user.adminRole, "categories.manage"),
    settings: can(user.adminRole, "settings.manage"),
    comms: can(user.adminRole, "announcements.send"),
    logs: can(user.adminRole, "logs.view"),
    finance: can(user.adminRole, "finance.view"),
  };
  return (
    <div className="min-h-dvh lg:flex">
      <AdminNav role={user.adminRole!} name={user.firstName} perms={perms} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
