import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { LogOut, Moon, Sun } from "lucide-react";

export default function InstructorLayout() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  if (!user || user.role !== "instructor") return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button onClick={() => navigate("/instructor/home")} className="flex items-center gap-2">
            <span className="font-heading text-lg font-bold">AYA</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">Instructor</span>
          </button>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground mr-2 hidden sm:inline">{user.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9"
              data-testid="instructor-theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9"
              data-testid="instructor-logout-button"
              onClick={() => { logout(); navigate("/login"); }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="px-4 py-6 max-w-2xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
