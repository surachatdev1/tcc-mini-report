import type { Metadata, Viewport } from "next";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบประเมินการเดินทางที่ปลอดภัยของเด็กนักเรียน",
  description:
    "เครื่องมือประเมินตนเองสำหรับสถานศึกษาและหน่วยงาน เพื่อค้นหาความเสี่ยงและวางแผนพัฒนาความปลอดภัยในการเดินทางของนักเรียน",
  other: {
    "codex-preview": "development",
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#00635a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
