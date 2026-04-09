/**
 * Output formatters for validation results.
 */

'use strict';

const ICONS = { PASS: '[PASS]', WARN: '[WARN]', FAIL: '[FAIL]' };

function formatTable(results) {
  if (results.length === 0) return 'No checks were run.\n';

  const grouped = {};
  for (const r of results) {
    const key = r.plugin || '(global)';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const lines = [];
  lines.push('NEXTC-CLAUDE VALIDATION REPORT');
  lines.push('==============================');
  lines.push('');

  for (const [plugin, items] of Object.entries(grouped)) {
    const counts = {};
    for (const item of items) {
      const cat = item.component + 's';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const parts = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k}`);
    lines.push(`${plugin} (${parts.join(', ') || 'no checks'})`);
    lines.push('-'.repeat(Math.max(40, plugin.length + 20)));

    for (const item of items) {
      const icon = ICONS[item.level] || '[????]';
      const scope = item.component + (item.name ? ':' + item.name : '');
      lines.push(`  ${icon} ${scope} — ${item.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatSummary(summary) {
  const parts = [];
  if (summary.pass > 0) parts.push(`${summary.pass} PASS`);
  if (summary.warn > 0) parts.push(`${summary.warn} WARN`);
  if (summary.fail > 0) parts.push(`${summary.fail} FAIL`);
  return `Summary: ${parts.join(', ') || 'no results'}`;
}

function formatJSON(results, summary) {
  return JSON.stringify({ results, summary }, null, 2);
}

module.exports = { formatTable, formatSummary, formatJSON };
