"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  // Auth disabled: always go to dashboard
  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);
  return null;
}
