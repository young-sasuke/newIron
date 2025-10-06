"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  // Auth disabled: callback just forwards to dashboard
  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);
  return null;
}
