import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealership Image Editor",
  description: "Auto-edit vehicle photos with white backgrounds",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
