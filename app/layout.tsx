import type { Metadata } from "next";
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
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
