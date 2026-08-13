import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Image Scraper",
  description: "Scrape a single page and browse every image found on it.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user && (
          <div className="flex items-center justify-end gap-3 px-4 py-2 text-sm text-black/60 dark:text-white/60">
            <span>{user.email}</span>
            <form action={signOut}>
              <button type="submit" className="underline hover:text-black dark:hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
