import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <h1 data-testid="app-title" className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">
            AYA
          </h1>
          <p className="text-muted-foreground text-sm font-body tracking-widest uppercase">
            Regulars Manager
          </p>
        </div>

        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-xl">Sign in</CardTitle>
            <CardDescription className="font-body text-sm">
              Enter your credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  data-testid="login-email-input"
                  id="email"
                  type="email"
                  placeholder="admin@aya.dance"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  data-testid="login-password-input"
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl"
                  required
                />
              </div>
              <Button
                data-testid="login-submit-button"
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-full font-medium transition-all active:scale-95"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/60 font-body">
          AYA Dance Club Management System
        </p>
      </div>
    </div>
  );
}
