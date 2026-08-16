import assert from "node:assert/strict";
import test from "node:test";
import { buildBenchmarkSnapshots, comparisonText, median } from "../lib/benchmarking.ts";

const records = Array.from({ length: 12 }, (_, index) => ({
  topicId: "bus" as const,
  agencyType: null,
  province: index < 10 ? "กรุงเทพมหานคร" : "เชียงใหม่",
  score: 50 + index,
  grade: "C" as const,
  categoryScores: [{ id: "driver", label: "ผู้ขับรถ", weight: 100, percent: 60 + index, contribution: 60 + index }],
}));

test("median รองรับข้อมูลจำนวนคู่และคี่", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("ข้อมูลเปรียบเทียบเผยแพร่เฉพาะกลุ่มอย่างน้อย 10 รายการ", () => {
  const snapshots = buildBenchmarkSnapshots(records, "2026-08-16T00:00:00.000Z");
  assert.ok(snapshots.has("bus--none--all"));
  assert.ok(snapshots.has("bus--none--กรุงเทพมหานคร"));
  assert.equal(snapshots.has("bus--none--เชียงใหม่"), false);
  const pilot = snapshots.get("bus--none--all");
  assert.equal(pilot?.sampleSize, 12);
  assert.equal(pilot?.medianScore, 55.5);
  assert.equal(pilot?.categoryMedians[0].percent, 65.5);
});

test("ข้อความเปรียบเทียบระบุทิศทางจากค่ากลาง", () => {
  const snapshot = buildBenchmarkSnapshots(records).get("bus--none--all");
  assert.ok(snapshot);
  assert.match(comparisonText(70, snapshot), /สูงกว่า/);
  assert.match(comparisonText(40, snapshot), /ต่ำกว่า/);
});
