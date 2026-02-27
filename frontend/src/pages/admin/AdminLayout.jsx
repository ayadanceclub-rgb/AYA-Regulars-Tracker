import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, Users, Calendar, FileText, Bell, Settings,
  LogOut, Menu, Moon, Sun, Shield, BarChart3, Layers
} from "lucide-react";

const navItems = [
  { to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/batches", label: "Batches", icon: Layers },
  { to: "/admin/dancers", label: "Dancers", icon: Users },
  { to: "/admin/instructors", label: "Instructors", icon: Shield },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/audit-log", label: "Audit Log", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function SidebarNav({ onItemClick }) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight">AYA</h1>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-0.5">Admin Panel</p>
      </div>
      <Separator />
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onItemClick}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 space-y-1">
        <Separator className="mb-3" />
        <button
          data-testid="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          data-testid="logout-button"
          onClick={() => { logout(); navigate("/login"); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-60 border-r border-border flex-col fixed h-screen bg-background z-30">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-60">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="mobile-menu-button" className="rounded-full">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SidebarNav onItemClick={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="font-heading text-lg font-bold">AYA</span>
          </div>
        </header>

        <main className="px-4 md:px-8 py-6 md:py-8 max-w-7xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
