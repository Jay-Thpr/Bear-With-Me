import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Skill Quest — Real-Time Coaching",
  description: "Research-backed coaching, live feedback, and a pixel hero that grows with you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="min-h-screen flex flex-col antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
