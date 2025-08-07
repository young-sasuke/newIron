// app/admin/layout.tsx
import AdminLayout from "../admin-layout/layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
