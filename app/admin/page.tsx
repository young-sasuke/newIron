// this is a Server Component
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  // Redirect `/admin` → `/admin/orders`
  redirect("/admin/orders");
}
