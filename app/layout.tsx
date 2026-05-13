import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day Planner",
  description: "Hybrid recommender for choosing what to do today."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
