import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { getAuthSession } from "@/lib/auth/server";
import { SearchProvider } from "./recordings/search-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkTV",
  description: "Capture, search, and share meeting recordings for your team.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, isAuthenticated } = await getAuthSession();
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <ThemeProvider>
            <SearchProvider>
              <div className="min-h-screen bg-zinc-950 text-zinc-50 transition-colors light:bg-zinc-100 light:text-zinc-900">
                <header className="border-b border-white/10 bg-zinc-900/50 transition-colors light:border-zinc-200 light:bg-white">
                  <div className="mx-auto flex max-w-7xl items-center px-6 py-4">
                    <Link href="/" className="flex-shrink-0">
                      <Image
                        src="/logo.png"
                        alt="WorkTV"
                        width={80}
                        height={80}
                        className="h-20 w-20"
                      />
                    </Link>
                    <div id="nav-title" className="flex flex-1 justify-center" />
                    <div className="flex items-center gap-3">
                      <ThemeToggle />
                      {isAuthenticated && user && <UserMenu user={user} />}
                    </div>
                  </div>
                </header>
                <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
              </div>
            </SearchProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
