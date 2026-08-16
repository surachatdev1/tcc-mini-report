/* eslint-disable @next/next/no-img-element -- Firebase Hosting serves this pre-optimized local WebP directly. */
import Link from "next/link";

export function SiteHeader({ active }: { active: "assessment" | "dashboard" | "admin" }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand-block brand-link" href="/" aria-label="กลับหน้าแบบประเมิน">
          <span className="brand-mark" aria-hidden="true">
            <img
              src="/images/tcc-office-logo.webp"
              width="480"
              height="306"
              alt=""
              decoding="async"
            />
          </span>
          <div>
            <p className="brand-title">การเดินทางที่ปลอดภัยของเด็กนักเรียน</p>
            <p className="brand-subtitle">สำรวจความพร้อม เห็นช่องว่าง และนำไปพัฒนา</p>
          </div>
        </Link>
        <nav className="main-nav" aria-label="เมนูหลัก">
          <Link aria-current={active === "assessment" ? "page" : undefined} href="/">ทำแบบประเมิน</Link>
          <Link aria-current={active === "dashboard" ? "page" : undefined} href="/dashboard">Dashboard</Link>
          <Link aria-current={active === "admin" ? "page" : undefined} href="/admin">ผู้ดูแลระบบ</Link>
        </nav>
      </div>
    </header>
  );
}
