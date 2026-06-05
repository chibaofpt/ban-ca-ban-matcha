"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as authService from "@/src/services/authService";
import { Eye, EyeOff } from "lucide-react";

/** AdminLoginPage — trang đăng nhập cho admin/staff nội bộ. */
export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // If the user already has a valid admin/staff session, skip the login page.
  useEffect(() => {
    authService
      .getMe()
      .then((user) => {
        if (user.role === "ADMIN") {
          router.replace("/admin/menu");
        } else if (user.role === "STAFF") {
          router.replace("/staff/orders");
        } else {
          setIsChecking(false);
        }
      })
      .catch(() => {
        // No valid session — show the login form.
        setIsChecking(false);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await authService.login({
        phone_number: phone,
        password,
      });
      if (user.role === "ADMIN") {
        router.replace("/admin/menu");
      } else {
        router.replace("/staff/orders");
      }
    } catch {
      setError("Sai số điện thoại hoặc mật khẩu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Show a spinner while checking the existing session.
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary/40 via-background to-secondary/20">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary/40 via-background to-secondary/20 px-4">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-xl border border-border p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🐟</div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            Bánh Cá Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Đăng nhập nội bộ</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-foreground">
              Số điện thoại
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="09xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border border-border bg-background pl-3 pr-10 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl h-11 mt-2 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-60"
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
