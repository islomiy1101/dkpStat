import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { DataProvider } from "@/components/DataProvider";

/** Himoyalangan qism: sessiya bo'lmasa /login ga yo'naltiriladi */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { login, fullName, branch, department, role } = user;

  return (
    <DataProvider>
      <div className="app-shell">
        <Sidebar user={{ login, fullName, branch, department, role }} />
        <main className="app-main">{children}</main>
      </div>
    </DataProvider>
  );
}
