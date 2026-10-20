import { redirect } from "next/navigation";
import { PASSWORD_PAGE, getUser } from "@/lib/auth";
import { SECTIONS } from "@/lib/sections";
import { canSee } from "@/lib/roles";
import Sidebar from "@/components/Sidebar";
import { DataProvider } from "@/components/DataProvider";

/** Himoyalangan qism: sessiya bo'lmasa /login ga yo'naltiriladi */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChange) redirect(PASSWORD_PAGE);
  const { login, fullName, branch, department, role } = user;
  // Faqat ruxsat etilgan bo'limlar yuklanadi va sidebar'da ko'rinadi
  const allowed = SECTIONS.filter((s) => canSee(role, s.id)).map((s) => s.id);

  return (
    <DataProvider allowed={allowed}>
      <div className="app-shell">
        <Sidebar user={{ login, fullName, branch, department, role }} />
        <main className="app-main">{children}</main>
      </div>
    </DataProvider>
  );
}
