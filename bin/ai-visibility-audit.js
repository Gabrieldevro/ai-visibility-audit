#!/usr/bin/env node
// ai-visibility-audit <url...> [--json] [--no-live] [--min-score=70]
import { auditSite } from '../src/audit.js';

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith('--'));
const asJson = args.includes('--json');
const live = !args.includes('--no-live');
const minScore = Number((args.find((a) => a.startsWith('--min-score=')) || '').split('=')[1] || 0);

if (!urls.length || args.includes('--help')) {
  console.log(`Usage: ai-visibility-audit <url> [url...] [--json] [--no-live] [--min-score=70]

Checks whether ChatGPT, Claude, Perplexity and other AI assistants can reach, read and cite a page:
robots.txt rules per AI agent, firewall/CDN blocks, server-rendered content, llms.txt, entity schema.

  --json         machine-readable output
  --no-live      skip the requests made with AI user agents
  --min-score=N  exit with code 2 when a score is below N (for CI)`);
  process.exit(urls.length ? 0 : 1);
}

const tty = process.stdout.isTTY;
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const mark = { pass: paint(32, '✔'), warn: paint(33, '▲'), fail: paint(31, '✖'), info: paint(36, 'ℹ') };

const reports = [];
for (const url of urls) {
  try {
    reports.push(await auditSite(url, { live }));
  } catch (err) {
    reports.push({ url, error: err.message, score: 0, checks: [] });
  }
}

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const r of reports) {
    console.log('\n' + paint(1, r.url));
    if (r.error) {
      console.log(paint(31, `  ✖ Could not fetch the page: ${r.error}`));
      continue;
    }
    const color = r.score >= 80 ? 32 : r.score >= 50 ? 33 : 31;
    console.log(`  AI visibility score: ${paint(color, paint(1, `${r.score}/100`))}\n`);

    console.log(paint(2, '  robots.txt'));
    for (const kind of ['search', 'user', 'training']) {
      const row = r.agents.filter((a) => a.kind === kind && !['Googlebot', 'Bingbot'].includes(a.token));
      const label = { search: 'AI search ', user: 'User fetch', training: 'Training  ' }[kind];
      console.log(`  ${label}  ${row.map((a) => `${a.allowed ? mark.pass : mark.fail} ${a.token}`).join('  ')}`);
    }
    console.log('');
    for (const c of r.checks) {
      console.log(`  ${mark[c.status]} ${c.message}`);
      if (c.fix && c.status !== 'pass') console.log(paint(2, c.fix.replace(/^/gm, '      → ').replace(/→ (?=User-agent|Allow)/g, '  ')));
    }
  }
  console.log('');
}

process.exit(reports.some((r) => r.score < minScore) ? 2 : 0);
