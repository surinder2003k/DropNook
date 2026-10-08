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
    "DropNook is a free, no-sign-up file sharing tool. Drag, drop, and share any file up to 5 GB — powered by Backblaze B2 storage.",
  keywords: ["DropNook", "file sharing", "share files", "upload files", "no sign-up"],
  openGraph: {
    title: "DropNook — Upload & share files instantly",
    description:
      "Free, no-sign-up file sharing. Drag, drop, and share any file up to 5 GB.",
    siteName: "DropNook",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DropNook — Upload & share files instantly",
    description:
      "Free, no-sign-up file sharing. Drag, drop, and share any file up to 5 GB.",
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

