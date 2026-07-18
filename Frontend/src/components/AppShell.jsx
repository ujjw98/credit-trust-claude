import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";

const NAV = [
  { to: "/app", label: "Dashboard", end: true },
  { to: "/app/retailers", label: "Retailers" },
  { to: "/app/invoices", label: "Invoices" },
  { to: "/app/returns", label: "Returns" },
  { to: "/app/disputes", label: "Disputes" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/profile", label: "Profile" },
];

export default function AppShell() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-ink text-paper-card">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="font-display text-xl font-semibold tracking-tight">CreditTrust</p>
          <p className="mt-0.5 text-xs uppercase tracking-widest text-gold-light">Wholesaler Ledger</p>
        </div>
        <nav className="flex-1 px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `mb-1 block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-paper-card/70 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-4">
          <p className="truncate text-sm font-medium">{profile?.name}</p>
          <p className="text-xs capitalize text-paper-card/60">{profile?.role}</p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs font-medium uppercase tracking-wide text-gold-light hover:text-gold"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between bg-ink px-8 py-3">
          <div />
          <NotificationBell listPath="/notifications" readPath={(id) => `/notifications/${id}/read`} />
        </header>
        <main className="ledger-bg min-h-[calc(100vh-52px)] px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
