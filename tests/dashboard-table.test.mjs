import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationItems, pageSizes, sortDashboardRecords } from '../lib/dashboard-table.ts';

const base = { institution: 'โรงเรียน 1', assessmentDate: '2026-09-24', createdAt: '', score: 0 };
const row = (id, fields = {}) => ({ ...base, id, ...fields });
const ids = records => records.map(record => record.id);

test('scores sort numerically in both directions without changing source', () => {
  const source = [row('a', { score: 100 }), row('b', { score: 9 }), row('c', { score: 72.2 })];
  assert.deepEqual(ids(sortDashboardRecords(source, 'score', 'asc')), ['b', 'c', 'a']);
  assert.deepEqual(ids(sortDashboardRecords(source, 'score', 'desc')), ['a', 'c', 'b']);
  assert.deepEqual(ids(source), ['a', 'b', 'c']);
});
test('Thai names use natural numeric order and missing names stay last', () => {
  const source = [row('a', { institution: 'โรงเรียน 10' }), row('b', { institution: 'โรงเรียน 2' }), row('c', { institution: '' })];
  assert.deepEqual(ids(sortDashboardRecords(source, 'institution', 'asc')), ['b', 'a', 'c']);
  assert.deepEqual(ids(sortDashboardRecords(source, 'institution', 'desc')), ['a', 'b', 'c']);
});
test('date sorting uses Bangkok fallback dates and deterministic ties', () => {
  const source = [row('b'), row('a'), row('c', { assessmentDate: '2026-09-23' }), row('d', { assessmentDate: '', createdAt: '2026-09-24T18:00:00Z' })];
  assert.deepEqual(ids(sortDashboardRecords(source, 'assessmentDate', 'desc')), ['d', 'a', 'b', 'c']);
});
test('sorting the full result set before pagination retains every record', () => {
  const source = Array.from({ length: 45 }, (_, i) => row(String(i), { score: i }));
  const sorted = sortDashboardRecords(source, 'score', 'desc');
  assert.equal(sorted.slice(0, 20)[0].score, 44);
  assert.equal(sorted.slice(20, 40)[0].score, 24);
  assert.equal(sorted.slice(40, 60).length, 5);
  assert.equal(new Set(sorted.map(record => record.id)).size, 45);
  assert.deepEqual(pageSizes, [10, 20, 50, 100]);
});
test('pagination exposes endpoints, current page and compact gaps', () => {
  assert.deepEqual(paginationItems(1, 1), [1]);
  assert.deepEqual(paginationItems(2, 3), [1, 2, 3]);
  assert.deepEqual(paginationItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis-right', 20]);
  assert.deepEqual(paginationItems(10, 20), [1, 'ellipsis-left', 9, 10, 11, 'ellipsis-right', 20]);
  assert.deepEqual(paginationItems(20, 20), [1, 'ellipsis-left', 16, 17, 18, 19, 20]);
});
