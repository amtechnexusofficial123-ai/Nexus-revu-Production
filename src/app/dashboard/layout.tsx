import { redirect } from "next/navigation";
import { getSessionAdminId } from "@/lib/auth";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const adminId = await getSessionAdminId();
  if (!adminId) redirect("/login");

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-ink/10 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-display text-lg text-ink">
            <img src="/nexusrevu-mark.svg" alt="" className="h-6 w-6 shrink-0" />
            <span className="truncate">
              Nexus<span className="text-brand">Revu</span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-4 text-sm font-medium text-ink/70 sm:gap-5">
            <Link href="/dashboard" className="hover:text-ink">
              Businesses
            </Link>
            <Link href="/dashboard/activity" className="hover:text-ink">
              Activity
            </Link>
            <Link href="/dashboard/errors" className="hover:text-ink">
              Errors
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
