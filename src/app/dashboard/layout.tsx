import { auth } from "@clerk/nextjs/server";
import { DashboardNav } from "./dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <DashboardNav />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
