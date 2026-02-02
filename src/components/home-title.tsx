"use client";

import { usePathname } from "next/navigation";

export function HomeTitle() {
  const pathname = usePathname();

  // Only show on the recordings list page, not on detail pages
  if (pathname !== "/recordings") {
    return null;
  }

  return (
    <h1 className="text-xl font-semibold text-zinc-50 light:text-zinc-900">
      Let&apos;s watch WorkTV
    </h1>
  );
}
