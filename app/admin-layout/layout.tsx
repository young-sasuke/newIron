"use client";

import AdminLayout from "@/components/AdminLayout";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  // Auth disabled: directly render the admin shell + toasts
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
