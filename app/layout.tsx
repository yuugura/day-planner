import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What Now",
  description: "Recommendations for deciding what to do right now."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
