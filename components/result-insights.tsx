"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgencyType, TopicId } from "@/lib/assessment-data";
import { comparisonText, type BenchmarkSnapshot } from "@/lib/benchmarking";
import { loadPeerBenchmark } from "@/lib/integrations/benchmark-repository";
import type { CategoryScore, QuestionResult } from "@/lib/scoring";

type Props = {
  topicId: TopicId;
  agencyType: AgencyType | null;
  province: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "-";
  categories: CategoryScore[];
  questionResults: QuestionResult[];
  recommendations: string[];
};

export function ResultInsights({ topicId, agencyType, province, score, grade, categories, questionResults, recommendations }: Props) {
  const benchmarkKey = `${topicId}:${agencyType ?? "none"}:${province}`;
  const [benchmarkState, setBenchmarkState] = useState<{ key: string; value: BenchmarkSnapshot | null } | null>(null);
  const benchmarkReady = benchmarkState?.key === benchmarkKey;
  const benchmark = benchmarkReady ? benchmarkState.value : null;

  useEffect(() => {
    let active = true;
    void loadPeerBenchmark(topicId, agencyType, province)
      .then((value) => {
        if (active) setBenchmarkState({ key: benchmarkKey, value });
      })
      .catch(() => {
        if (active) setBenchmarkState({ key: benchmarkKey, value: null });
      });
    return () => { active = false; };
  }, [agencyType, benchmarkKey, province, topicId]);

  const orderedCategories = useMemo(() => [...categories].sort((a, b) => b.percent - a.percent), [categories]);
  const strongest = orderedCategories[0];
  const priority = orderedCategories.at(-1);
  const standardCount = questionResults.filter((item) => !item.requiresImprovement).length;
  const benchmarkByCategory = useMemo(
    () => new Map(benchmark?.categoryMedians.map((item) => [item.id, item]) ?? []),
    [benchmark],
  );

  return (
    <section className="result-insights" aria-labelledby="result-insights-title">
      <div className="result-section-heading">
        <p className="section-kicker">เห็นภาพรวมก่อนดูรายละเอียดรายข้อ</p>
        <h3 id="result-insights-title">สรุปผลและตำแหน่งเมื่อเทียบกับกลุ่ม</h3>
      </div>

      <div className="insight-cards">
        <article>
          <span>กลุ่มผลปัจจุบัน</span>
          <strong>ระดับ {grade}</strong>
          <small>{standardCount} จาก {questionResults.length} ข้อถึงขั้นมาตรฐาน</small>
        </article>
        <article>
          <span>จุดแข็ง</span>
          <strong>{strongest?.label ?? "—"}</strong>
          <small>{strongest ? `${strongest.percent.toFixed(1)}%` : "ยังไม่มีข้อมูล"}</small>
        </article>
        <article className="priority">
          <span>ควรให้ความสำคัญก่อน</span>
          <strong>{priority?.label ?? "—"}</strong>
          <small>{priority ? `${priority.percent.toFixed(1)}%` : "ยังไม่มีข้อมูล"}</small>
        </article>
      </div>

      <div className="comparison-heading">
        <div>
          <h4>คะแนนแยกตามหมวด</h4>
          <p>{benchmark
            ? `${comparisonText(score, benchmark)} · เปรียบเทียบกับ${benchmark.scope === "province" ? `จังหวัด${benchmark.province}` : "ภาพรวม 12 จังหวัดนำร่อง"} ${benchmark.sampleSize} ผลประเมิน`
            : benchmarkReady
              ? "ยังมีผลประเมินในกลุ่มน้อยกว่า 10 รายการ จึงแสดงเทียบกับเส้นขั้นมาตรฐานแทน"
              : "กำลังตรวจสอบข้อมูลเปรียบเทียบ…"}</p>
        </div>
        <div className="comparison-legend" aria-label="คำอธิบายกราฟ">
          <span><i className="current" /> ผลของคุณ</span>
          {benchmark ? <span><i className="peer" /> ค่ากลางของกลุ่ม</span> : <span><i className="standard" /> ขั้นมาตรฐาน</span>}
        </div>
      </div>

      <div className="comparison-chart">
        {categories.map((category) => {
          const peer = benchmarkByCategory.get(category.id);
          return (
            <div className="comparison-row" key={category.id}>
              <div className="comparison-row-title"><strong>{category.label}</strong><span>{category.percent.toFixed(1)}%</span></div>
              <div
                className="comparison-bar"
                role="meter"
                aria-label={`${category.label} ผลของคุณ ${category.percent.toFixed(1)} เปอร์เซ็นต์${peer ? ` ค่ากลางของกลุ่ม ${peer.percent.toFixed(1)} เปอร์เซ็นต์` : " ขั้นมาตรฐาน 66.7 เปอร์เซ็นต์"}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(category.percent.toFixed(1))}
              >
                <span className="comparison-current" style={{ width: `${Math.min(100, category.percent)}%` }} />
                {!benchmark ? <i className="standard-marker" style={{ left: "66.67%" }} aria-hidden="true" /> : null}
              </div>
              {peer ? (
                <div className="comparison-peer-line">
                  <span style={{ width: `${Math.min(100, peer.percent)}%` }} />
                  <small>ค่ากลาง {peer.percent.toFixed(1)}%</small>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="overall-recommendations">
        <h4>ข้อเสนอแนะสำคัญ</h4>
        <ol>
          {recommendations.slice(0, 5).map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
        </ol>
        {recommendations.length > 5 ? <p>มีข้อเสนอแนะเพิ่มเติมอีก {recommendations.length - 5} ข้อในรายละเอียดด้านล่าง</p> : null}
      </div>
    </section>
  );
}
