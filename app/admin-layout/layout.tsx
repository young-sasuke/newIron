"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminLayout from "../admin-layout/layout";
import { ADMIN_EMAILS } from "@/lib/admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const userEmail = session.user.email ?? "";
      if (!ADMIN_EMAILS.includes(userEmail)) {

        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      setChecking(false);
    }
    checkAuth();
  }, [router]);

  if (checking) {
    return <div className="flex items-center justify-center min-h-screen">Checking admin access...</div>;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
