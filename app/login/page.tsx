"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ADMIN_EMAILS } from "@/lib/admin";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Check admin email
    if (!ADMIN_EMAILS.includes(email)) {
      setError("Not an admin. Access denied.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    router.replace("/admin/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="bg-white shadow rounded-lg p-8 w-96 flex flex-col gap-4">
        <h2 className="text-xl font-bold mb-2">Admin Login</h2>
        <input
          className="border rounded px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
        />
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <button
          className="bg-blue-600 text-white font-bold py-2 rounded mt-2"
          type="submit"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
