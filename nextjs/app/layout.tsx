import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Data Analyst",
  description: "AI-assisted analyst workbench — SQL, Python, statistics, and reports.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
