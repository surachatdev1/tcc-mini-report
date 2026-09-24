import assert from 'node:assert/strict';
import test from 'node:test';
import { affiliationIndex, assessmentDay, emptyDashboardFilters, filterDashboardRecords, recordAffiliation } from '../lib/dashboard-filters.ts';

const base = { id: '1', institution: 'สันป่าตองวิทยาคม', province: 'เชียงใหม่', topicId: 'trip', assessorName: 'สมชาย ใจดี', respondentRole: 'ครู / ผู้รับผิดชอบความปลอดภัย', position: 'หัวหน้างาน', grade: 'B', assessmentDate: '2026-09-24', createdAt: '2026-09-24T01:00:00Z' };
const records = [base, { ...base, id: '2', institution: 'โรงเรียนเอกชนทดสอบ', grade: 'C', assessmentDate: '2026-09-23' }, { ...base, id: '3', province: 'ลำปาง', assessorName: 'มานี', topicId: 'bus', grade: 'D' }, { ...base, id: '4', institution: 'สำนักงานทดสอบ', topicId: 'agency', grade: 'A' }];
const directories = { 'เชียงใหม่': affiliationIndex([{ name: 'โรงเรียนสันป่าตองวิทยาคม', source: 'obec' }, { name: 'โรงเรียนเอกชนทดสอบ', source: 'private' }]) };
function find(overrides, data = records, personal = true) { return filterDashboardRecords(data, { ...emptyDashboardFilters, ...overrides }, directories, personal).map(record => record.id); }

test('combines all advanced filters with AND', () => {
  assert.deepEqual(find({ institution: ' สันป่าตอง ', affiliation: 'obec', province: 'เชียงใหม่', topicId: 'trip', responsible: 'สมชาย', grade: 'B', dateFrom: '2026-09-24', dateTo: '2026-09-24' }), ['1']);
  assert.deepEqual(find({ province: 'เชียงใหม่', grade: 'D' }), []);
});
test('each field filters independently and clearing returns all records', () => {
  assert.deepEqual(find({ institution: 'เอกชน' }), ['2']);
  assert.deepEqual(find({ affiliation: 'private' }), ['2']);
  assert.deepEqual(find({ province: 'ลำปาง' }), ['3']);
  assert.deepEqual(find({ topicId: 'agency' }), ['4']);
  assert.deepEqual(find({ responsible: 'มานี' }), ['3']);
  assert.deepEqual(find({ responsible: 'หัวหน้างาน' }), ['1','2','3','4']);
  assert.deepEqual(find({ grade: 'A' }), ['4']);
  assert.deepEqual(find({}), ['1','2','3','4']);
});
test('dates include both endpoints and support one-sided ranges', () => {
  assert.deepEqual(find({ dateTo: '2026-09-23' }), ['2']);
  assert.deepEqual(find({ dateFrom: '2026-09-24' }), ['1','3','4']);
  assert.deepEqual(find({ dateFrom: '2026-09-25', dateTo: '2026-09-23' }), []);
  assert.equal(assessmentDay({ ...base, assessmentDate: '', createdAt: '2026-09-23T18:00:00Z' }), '2026-09-24');
  assert.deepEqual(find({ dateTo: '2026-09-24' }, [{ ...base, assessmentDate: '', createdAt: 'invalid' }]), []);
});
test('affiliation stays scoped to province and ambiguous matches are unknown', () => {
  assert.equal(recordAffiliation(base, directories), 'obec');
  assert.equal(recordAffiliation(records[2], directories), 'unknown');
  assert.equal(recordAffiliation(records[3], directories), 'agency');
  const ambiguous = affiliationIndex([{ name: 'โรงเรียนทดสอบ', source: 'obec' }, { name: 'ทดสอบ', source: 'private' }, { name: 'ทดสอบ', source: 'private' }]);
  assert.equal(ambiguous.get('ทดสอบ'), 'unknown');
  assert.deepEqual(find({ affiliation: 'unknown' }), ['3']);
});
test('personal filters are ignored without personal-data access', () => {
  assert.deepEqual(find({ responsible: 'มานี' }, records, false), ['1','2','3','4']);
});
test('filtering does not mutate source records or truncate to the first page', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ ...base, id: String(i) }));
  assert.equal(find({ grade: 'B' }, many).length, 45);
  assert.equal(many.length, 45);
  assert.equal(find({}, []).length, 0);
});
