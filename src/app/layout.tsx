import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import AuthProvider from "@/components/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Glitch — Real-Time Self-Training Coach",
  description: "AI-powered live video coaching that gets smarter about you over time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="bg-zinc-950 font-sans antialiased text-zinc-50 flex flex-col min-h-screen">
        <AuthProvider>
          <Header />
          <main className="flex-1 flex flex-col pt-[88px]">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
