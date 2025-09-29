"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";
import { NAV_ITEMS, getVisibleNav } from "@/lib/navConfig";

export default function Tabs() {
  const pathname = usePathname();
  const { ready, isAdmin, perms, session } = useSession();
 
 const visibleTabs = getVisibleNav({ isAdmin, perms });

  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
        <nav className="flex flex-wrap gap-2">
          {visibleTabs.map(tab => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
       
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-gray-500 sm:inline">
            {session?.name ?? session?.userId ?? "—"} • {isAdmin ? "admin" : "user"}
          </span>
          <Link href="/conta" className="px-2 py-1 hover:underline">Minha Conta</Link>
        </div>
      </div>
    </div>
  );
}
