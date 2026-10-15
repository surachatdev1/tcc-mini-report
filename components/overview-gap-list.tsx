import { gapRankingNote, overviewGapStats, type OverviewGap, type OverviewQuestionLabel } from "@/lib/public-overview-gaps";

const number = (value: number) => value.toLocaleString("th-TH");

export function OverviewGapList({ entries, questionLabels }: {
  entries: [string, OverviewGap][];
  questionLabels: Record<string, OverviewQuestionLabel>;
}) {
  return <div className="td-gap-content">
    <p className="td-gap-note">{gapRankingNote}</p>
    <div className="td-gap-legend">
      <span><i className="td-gap-below" aria-hidden="true" />ต่ำกว่าเกณฑ์ · คะแนน 0–1</span>
      <span><i className="td-gap-meets" aria-hidden="true" />ถึงเกณฑ์ · คะแนน 2–3</span>
    </div>
    <ol className="td-gap-list" aria-label="ประเด็นที่พบผลต่ำกว่าเกณฑ์ เรียงตามจำนวนชุด">
      {entries.map(([key, value], index) => {
        const label = questionLabels[key];
        const { belowShare, belowPercent, meetsCount, meetsPercent } = overviewGapStats(value);
        return <li className="td-gap-item" key={key}>
          <div className="td-gap-heading">
            <span className="td-gap-rank" aria-hidden="true">{index + 1}</span>
            <div>
              <details className="td-gap-question">
                <summary><span>{label?.shortTitle ?? label?.title ?? "ประเด็นการประเมิน"}</span><span className="td-gap-chevron" aria-hidden="true">⌄</span></summary>
                <p><b>เกณฑ์ต้นฉบับ:</b> {label?.title ?? key}</p>
              </details>
              <small className="td-gap-topic">{label?.topic}</small>
            </div>
          </div>
          <div className="td-gap-metrics">
            <p className="td-gap-main"><strong>{number(value.count)} จาก {number(value.eligible)} ชุด</strong> ต่ำกว่าเกณฑ์</p>
            <div className="td-gap-bar" aria-hidden="true">
              <span className="td-gap-below" style={{ width: `${belowShare}%` }} />
              <span className="td-gap-meets" style={{ width: `${value.eligible ? 100 - belowShare : 0}%` }} />
            </div>
            <div className="td-gap-values">
              <span>ต่ำกว่าเกณฑ์ <b>{belowPercent ?? "—"}%</b></span>
              <span>ถึงเกณฑ์ <b>{number(meetsCount)} ชุด · {meetsPercent ?? "—"}%</b></span>
            </div>
          </div>
        </li>;
      })}
    </ol>
    <p className="td-gap-note">เปอร์เซ็นต์แสดงสัดส่วนของชุดที่ตอบข้อนั้น ไม่ใช่คะแนนเฉลี่ย • กดชื่อประเด็นเพื่ออ่านเกณฑ์ต้นฉบับ</p>
  </div>;
}
