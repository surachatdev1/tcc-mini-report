import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rubric = JSON.parse(await readFile(new URL("../lib/criteria.generated.json", import.meta.url), "utf8"));
const schoolTopics = Object.values(rubric.schoolTopics);
const agencyTopics = Object.values(rubric.agencyTopics);

test("จำนวนข้อและน้ำหนักตรงตามร่าง", () => {
  assert.deepEqual(schoolTopics.map((topic) => topic.questions.length), [9, 12, 12]);
  assert.deepEqual(agencyTopics.map((topic) => topic.questions.length), [3, 3, 3, 3]);
  for (const topic of [...schoolTopics, ...agencyTopics]) {
    assert.equal(topic.categories.reduce((sum, category) => sum + category.weight, 0), 100, topic.detail);
  }
});

test("ทุกข้อมีคะแนน 0–3 คำอธิบาย และข้อมูลประกอบ", () => {
  for (const topic of [...schoolTopics, ...agencyTopics]) {
    for (const question of topic.questions) {
      assert.ok(question.title.trim(), question.id);
      assert.ok(question.evidence.trim(), question.id);
      assert.deepEqual(question.options.map((option) => option.value), [0, 1, 2, 3], question.id);
      for (const option of question.options) assert.ok(option.description.trim(), `${question.id}:${option.value}`);
    }
  }
});

test("น้ำหนักรายหมวดตรงตามภาคผนวก", () => {
  assert.deepEqual(rubric.schoolTopics.bus.categories.map((item) => item.weight), [35, 35, 30]);
  assert.deepEqual(rubric.schoolTopics.trip.categories.map((item) => item.weight), [30, 30, 25, 15]);
  assert.deepEqual(rubric.schoolTopics.moto.categories.map((item) => item.weight), [30, 40, 20, 10]);
  assert.deepEqual(rubric.agencyTopics["road-safety"].categories.map((item) => item.weight), [40, 30, 30]);
  assert.deepEqual(rubric.agencyTopics["education-area"].categories.map((item) => item.weight), [35, 35, 30]);
  assert.deepEqual(rubric.agencyTopics.transport.categories.map((item) => item.weight), [40, 30, 30]);
  assert.deepEqual(rubric.agencyTopics["local-admin"].categories.map((item) => item.weight), [40, 35, 25]);
});
