import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui";
import "./globals.css";
import "./specific.css";
import "./overrides.css";
import "./records.css";

export const metadata: Metadata = {
  title: "Tranzora | Transport Management",
  description: "A complete transport business management platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
