// app/admin/layout.tsx
import AdminAuthLayout from "../admin-layout/layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminAuthLayout>{children}</AdminAuthLayout>;
}
