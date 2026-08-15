import Link from "next/link";

export function SiteHeader({ active }: { active: "assessment" | "dashboard" }) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand-block brand-link" href="/" aria-label="กลับหน้าแบบประเมิน">
          <div className="brand-mark" aria-hidden="true">TCC</div>
          <div>
            <p className="brand-title">การเดินทางที่ปลอดภัยของเด็กนักเรียน</p>
            <p className="brand-subtitle">สำรวจความพร้อม เห็นช่องว่าง และนำไปพัฒนา</p>
          </div>
        </Link>
        <nav className="main-nav" aria-label="เมนูหลัก">
          <Link aria-current={active === "assessment" ? "page" : undefined} href="/">ทำแบบประเมิน</Link>
          <Link aria-current={active === "dashboard" ? "page" : undefined} href="/dashboard">Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
