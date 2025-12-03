import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTIP Eğitim Yönetim Sistemi",
  description: "3 farklı eğitim merkezinin yönetimi için tasarlanmış sistem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
