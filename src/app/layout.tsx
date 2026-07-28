import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import {
  ACCOUNT_SESSION_COOKIE,
  verifyAccountSessionToken,
} from "@/lib/account-session";
import { AccountSessionProvider } from "@/components/account-session-provider";
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
  title: {
    default: "Ananta Stock",
    template: "%s · Ananta Stock",
  },
  description: "La gestion de stock simple pour les commerces.",
  applicationName: "Ananta Stock",
};

export const viewport: Viewport = {
  themeColor: "#23372e",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const accountSession = await verifyAccountSessionToken(
    cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value,
  );

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <AccountSessionProvider value={accountSession}>
          {children}
        </AccountSessionProvider>
      </body>
    </html>
  );
}
