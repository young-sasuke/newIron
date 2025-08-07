// components/Sidebar.tsx
import Link from "next/link";
import { LayoutDashboard, ShoppingCart, Package, Users, Settings } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
  { label: "Orders", href: "/orders", icon: <ShoppingCart size={20} /> },
  { label: "Products", href: "/products", icon: <Package size={20} /> },
  { label: "Users", href: "/users", icon: <Users size={20} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={20} /> },
];

export default function Sidebar() {
  return (
    <aside className="h-screen w-56 bg-white border-r flex flex-col fixed left-0 top-0 z-20">
      <div className="p-6 border-b">
        <span className="text-xl font-bold text-blue-700">IronXpress</span>
      </div>
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 p-2 rounded-lg text-gray-700 hover:bg-blue-100 transition group"
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
