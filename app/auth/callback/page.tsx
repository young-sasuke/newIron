"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { checkCurrentUserIsAdmin } from "@/lib/admin";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    handleAuthCallback();
  }, []);

  async function handleAuthCallback() {
    try {
      // Get the current session after OAuth callback
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Auth callback error:', error);
        router.push('/login?error=auth_failed');
        return;
      }

      if (!session) {
        router.push('/login?error=no_session');
        return;
      }

      // Check if the authenticated user has admin privileges
      const isAdmin = await checkCurrentUserIsAdmin();
      
      if (isAdmin) {
        // User is admin, redirect to dashboard
        router.push('/admin/dashboard');
      } else {
        // User is not admin, sign them out and redirect back to login
        await supabase.auth.signOut();
        router.push('/login?error=not_admin');
      }
    } catch (err) {
      console.error('Callback processing error:', err);
      router.push('/login?error=callback_failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Completing authentication...</p>
        <p className="text-sm text-gray-500">Please wait while we verify your credentials</p>
      </div>
    </div>
  );
}
