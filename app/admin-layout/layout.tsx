"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);

  // Client-side: only show a brief loading state while checking.
  // Do not navigate from here; server-side middleware enforces access.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false };
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Checking admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminLayout>{children}</AdminLayout>
      <ToastContainer 
        position="top-right" 
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </>
  );
}
