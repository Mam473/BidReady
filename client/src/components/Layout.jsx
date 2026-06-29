import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  FileText,
  FolderOpen,
  BarChart3,
  LogOut,
  Menu,
  X,
  Shield,
  CreditCard,
  LayoutDashboard,
  ScanSearch,
} from "lucide-react";
import ChatWidget from "./ChatWidget.jsx";

const NAV_ITEMS = [
  { to: "/documents",        icon: FolderOpen,     label: "Documents"      },
  { to: "/tenders",          icon: FileText,        label: "Tenders"        },
  { to: "/tender-analyzer",  icon: ScanSearch,      label: "Tender Analyzer" },
  { to: "/analysis",         icon: BarChart3,       label: "Analysis"       },
  { to: "/pricing",          icon: CreditCard,      label: "Pricing"        },
  { to: "/admin",            icon: LayoutDashboard, label: "Admin"          },
];

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-brand-500 text-white shadow-md"
            : "text-brand-200 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const raw = localStorage.getItem("bidready_profile");
  const profile = raw ? JSON.parse(raw) : {};

  function handleLogout() {
    localStorage.removeItem("bidready_profile");
    navigate("/onboarding");
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-brand-950 text-white fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-base leading-none">BidReady</p>
            <p className="text-xs text-brand-300 mt-0.5">Tender Compliance</p>
          </div>
        </div>

        {/* Company pill */}
        <div className="mx-4 mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs text-brand-300 font-medium uppercase tracking-wide mb-0.5">Company</p>
          <p className="font-semibold text-sm truncate">{profile.name || "—"}</p>
          <p className="text-xs text-brand-300 truncate mt-0.5">RC: {profile.rcNumber || "—"}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavItem key={to} to={to} icon={icon} label={label} />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-brand-300 hover:bg-white/10 hover:text-white transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            Change Company
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-brand-950 text-white flex items-center justify-between px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">BidReady</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-brand-950 text-white pt-16 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <p className="text-xs text-brand-300 font-medium uppercase tracking-wide mb-0.5">Company</p>
              <p className="font-semibold text-sm truncate">{profile.name || "—"}</p>
              <p className="text-xs text-brand-300 truncate mt-0.5">RC: {profile.rcNumber || "—"}</p>
            </div>
            <nav className="flex-1 px-3 space-y-1">
              {NAV_ITEMS.map(({ to, icon, label }) => (
                <NavItem key={to} to={to} icon={icon} label={label} onClick={() => setMobileOpen(false)} />
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-brand-300 hover:bg-white/10 hover:text-white transition-all"
              >
                <LogOut className="w-4 h-4" />
                Change Company
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>

      <ChatWidget />
    </div>
  );
}
