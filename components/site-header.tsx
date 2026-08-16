/* eslint-disable @next/next/no-img-element -- Firebase Hosting serves this pre-optimized local WebP directly. */
import Link from "next/link";

export function SiteHeader({ active }: { active: "assessment" | "dashboard" | "admin" }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link
          className="brand-block brand-link"
          href="/"
          aria-label="สภาองค์กรของผู้บริโภค และสำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ กลับหน้าแบบประเมิน"
        >
          <span className="brand-logos" aria-hidden="true">
            <span className="brand-logo brand-logo-tcc">
              <img
                src="/images/tcc-office-logo.webp"
                width="480"
                height="306"
                alt=""
                decoding="async"
              />
            </span>
            <span className="brand-logo-divider" />
            <span className="brand-logo brand-logo-thaihealth">
              <img
                src="/images/thaihealth-logo.webp"
                width="720"
                height="620"
                alt=""
                decoding="async"
              />
            </span>
          </span>
          <div>
            <p className="brand-agency">สภาองค์กรของผู้บริโภค (TCC) · สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ (สสส.)</p>
            <p className="brand-title">ระบบประเมินการเดินทางที่ปลอดภัยของเด็กนักเรียน</p>
            <p className="brand-subtitle">สำรวจความพร้อม เห็นช่องว่าง และนำไปพัฒนา</p>
          </div>
        </Link>
        <nav className="main-nav" aria-label="เมนูหลัก">
          <Link aria-current={active === "assessment" ? "page" : undefined} href="/">แบบประเมิน</Link>
          <Link aria-current={active === "dashboard" ? "page" : undefined} href="/dashboard">Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
