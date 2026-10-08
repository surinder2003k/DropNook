import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "DropNook — Upload & share files instantly",
  description:
    "DropNook is a free, no-sign-up file sharing tool. Drag, drop, and share any file up to 25 MB — powered by Supabase Storage.",
  keywords: ["DropNook", "file sharing", "share files", "upload files", "no sign-up"],
  openGraph: {
    title: "DropNook — Upload & share files instantly",
    description:
      "Free, no-sign-up file sharing. Drag, drop, and share any file up to 25 MB.",
    siteName: "DropNook",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DropNook — Upload & share files instantly",
    description:
      "Free, no-sign-up file sharing. Drag, drop, and share any file up to 25 MB.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}

