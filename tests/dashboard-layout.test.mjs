import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.createSourceFile('dashboard-workspace.tsx', readFileSync(new URL('../components/dashboard-workspace.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(source);
function attribute(node, key) {
  const attr = node.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === key);
  return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : '';
}
function hasClass(node, name) { return attribute(node, 'className').split(/\s+/).includes(name); }
function ancestors(node) {
  const result = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
}
function unique(predicate) {
  const matches = elements.filter(predicate);
  assert.equal(matches.length, 1);
  return matches[0];
}

test('Excel export panel is outside the search grid, form and personal-only branch', () => {
  const panel = unique(node => hasClass(node, 'export-panel'));
  const parents = ancestors(panel);
  assert.equal(parents.some(node => ts.isJsxElement(node) && (node.openingElement.tagName.getText(source) === 'form' || hasClass(node, 'advanced-search-grid'))), false);
  assert.equal(parents.some(node => ts.isConditionalExpression(node) && node.condition.getText(source).includes('personalDataVisible')), false);
  const results = unique(node => hasClass(node, 'assessment-results'));
  assert.equal(panel.parent, results.parent);
  assert.ok(panel.pos > results.end, 'Export summaries follow the complete results panel');
});

test('one search form precedes result controls, rows and pagination within the same panel', () => {
  const results = unique(node => hasClass(node, 'assessment-results'));
  const search = unique(node => attribute(node, 'id') === 'dashboard-search');
  const toolbar = unique(node => hasClass(node, 'record-table-toolbar'));
  const table = unique(node => hasClass(node, 'record-table-scroll'));
  const pagination = unique(node => hasClass(node, 'record-pagination'));
  for (const node of [search, toolbar, table, pagination]) assert.ok(ancestors(node).includes(results));
  assert.ok(search.end < toolbar.pos);
  assert.ok(toolbar.end < table.pos);
  assert.ok(table.end < pagination.pos);
  const grid = unique(node => hasClass(node, 'advanced-search-grid'));
  const gridSections = elements.filter(node => ancestors(node).includes(grid) && node.openingElement.tagName.getText(source) === 'section');
  assert.equal(gridSections.length, 0, 'Search grid must not contain unrelated panels');
});
