import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  BookOpenCheck,
  ChevronDown,
  ClipboardPenLine,
  FileText,
  LibraryBig,
  PackageCheck,
  LayoutDashboard,
  Scale,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "New consent", href: "/create", icon: ClipboardPenLine },
  { label: "Templates & sources", href: "/templates", icon: BookOpenCheck, adminOnly: true },
  { label: "EU product catalogue", href: "/catalogue", icon: LibraryBig, adminOnly: true },
  { label: "Review governance", href: "/education-governance", icon: Scale, adminOnly: true },
  { label: "Supplier governance", href: "/supply-governance", icon: PackageCheck, adminOnly: true },
  { label: "Records", href: "/records", icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loading } = useAuth();
  const workspaceQuery = trpc.workspace.overview.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const isAdmin = workspaceQuery.data?.membership.role === "admin";
  const workspaceLoading = Boolean(user) && workspaceQuery.isLoading;
  const workspaceUnavailable = Boolean(user) && workspaceQuery.isError;

  const sidebar = (
    <aside className="app-sidebar flex h-full w-[274px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-3 px-3 pb-9 pt-1" onClick={() => setMobileOpen(false)}>
        <div className="grid size-10 place-items-center rounded-[0.9rem] bg-[#e0cfaa] text-[#1b3b35] shadow-[0_6px_18px_rgba(0,0,0,0.14)]">
          <ShieldCheck className="size-5" strokeWidth={1.8} />
        </div>
        <div>
          <p className="serif text-[1.42rem] font-semibold leading-none tracking-tight text-white">Aegis</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-100/55">Consent studio</p>
        </div>
      </Link>

      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-emerald-100/45">Clinical workspace</p>
      {workspaceLoading ? <div className="space-y-2 px-3"><div className="h-9 animate-pulse rounded-lg bg-white/10" /><div className="h-9 animate-pulse rounded-lg bg-white/10" /><div className="h-9 animate-pulse rounded-lg bg-white/10" /></div> : workspaceUnavailable ? <div className="mx-3 rounded-xl border border-amber-200/20 bg-amber-100/10 p-3 text-xs leading-relaxed text-amber-100/80">Clinic workspace unavailable. Refresh after confirming your clinic membership.</div> : user ? <nav className="space-y-1">
        {navigation.filter(item => !item.adminOnly || isAdmin).map(item => {
          const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn("side-link", active && "side-link-active")}>
              <Icon className="size-[17px]" strokeWidth={1.8} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav> : <p className="px-3 text-xs leading-relaxed text-emerald-50/65">Sign in to access clinic records and consent tools.</p>}

      <div className="mt-8 border-t border-white/10 pt-7">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-emerald-100/45">Practice</p>
        {!workspaceLoading && !workspaceUnavailable && isAdmin && <Link href="/profile" onClick={() => setMobileOpen(false)} className={cn("side-link", location.startsWith("/profile") && "side-link-active")}>
          <Settings className="size-[17px]" strokeWidth={1.8} />
          <span className="font-medium">Clinic profile</span>
        </Link>}
      </div>

      <div className="sidebar-provenance-card mt-auto rounded-2xl border border-white/10 bg-white/[0.07] p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#e0cfaa]">Evidence boundary</p>
        <p className="mt-2 text-xs leading-relaxed text-emerald-50/70">Only approved SPC, PI, and IFU records can be included in a patient-ready consent.</p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f5f2eb] lg:grid lg:grid-cols-[274px_1fr]">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-50 bg-[#132f2a]/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <div className={cn("fixed inset-y-0 left-0 z-[60] transition-transform duration-200 lg:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <button className="absolute right-3 top-3 z-10 grid size-9 translate-x-full place-items-center rounded-r-lg bg-sidebar text-white" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="size-4" /></button>
        {sidebar}
      </div>

      <div className="min-w-0">
        <header className="app-topbar flex h-[76px] items-center justify-between border-b border-[#e5dfd5] bg-[#fbfaf7]/90 px-5 backdrop-blur lg:px-9">
          <div className="flex items-center gap-3">
            <button className="grid size-10 place-items-center rounded-xl border border-[#e5dfd5] bg-white text-[#21433d] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-4" /></button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8a897f]">Good afternoon</p>
              <p className="mt-0.5 text-sm font-medium text-[#24453e]">{workspaceQuery.data?.clinic.name || user?.name || "Your clinic workspace"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="grid size-10 place-items-center rounded-xl border border-[#e5dfd5] bg-white text-[#24453e]" aria-label="Notifications"><Bell className="size-4" /></button>
            {loading ? <div className="h-10 w-28 animate-pulse rounded-xl bg-[#ece7df]" /> : user ? (
              <button className="flex items-center gap-2 rounded-xl border border-[#e5dfd5] bg-white px-2.5 py-2 text-sm text-[#24453e]">
                <span className="grid size-6 place-items-center rounded-lg bg-[#d8c59f] text-[10px] font-bold text-[#25423b]">{user.name?.slice(0, 1).toUpperCase() || "C"}</span>
                <span className="hidden max-w-32 truncate sm:inline">{user.name}</span><ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            ) : (
              <button onClick={() => startLogin()} className="rounded-xl bg-[#24453e] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.97]">Sign in</button>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
