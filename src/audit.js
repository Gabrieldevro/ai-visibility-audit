import { AGENTS, LIVE_CHECK } from './agents.js';
import { parseRobots, isAllowed } from './robots.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const decode = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');

/** Visible text from HTML (scripts, styles, templates and SVG removed). */
export function visibleText(html = '') {
  const body = (html.match(/<body\b[\s\S]*<\/body>/i) || [html])[0];
  return decode(
    body
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function tagAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

function meta(html, attr, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if ((tagAttr(tag, attr) || '').toLowerCase() === value) return tagAttr(tag, 'content');
  }
  return null;
}

/** Signals an AI assistant relies on, read from the raw (non-rendered) HTML. */
export function pageSignals(html = '') {
  const text = visibleText(html);
  const words = text ? text.split(' ').length : 0;
  const scripts = (html.match(/<script\b/gi) || []).length;
  const emptyAppShell = /<div[^>]+id=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(html);

  const jsonLd = [];
  let jsonLdErrors = 0;
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of [].concat(data['@graph'] || data)) jsonLd.push(node);
    } catch {
      jsonLdErrors++;
    }
  }
  const types = jsonLd.flatMap((n) => [].concat(n['@type'] || []));
  const org = jsonLd.find((n) => [].concat(n['@type'] || []).some((t) => /Organization|LocalBusiness|Store|Corporation|Person/.test(t) || /Business$/.test(t)));

  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: +m[1], text: visibleText(m[2]) }));
  const questions = headings.filter((h) => h.level > 1 && (/\?$/.test(h.text) || /^(how|what|why|when|where|which|who|can|do|does|is|are|cum|ce|de ce|când|unde|care|cât|câte|cine|hvordan|hva|hvorfor)\b/i.test(h.text)));
  const robotsMeta = (meta(html, 'name', 'robots') || '').toLowerCase();

  return {
    title: (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || null,
    description: meta(html, 'name', 'description'),
    lang: (html.match(/<html\b[^>]*\blang\s*=\s*["']?([\w-]+)/i) || [])[1] || null,
    canonical: tagAttr((html.match(/<link\b[^>]*rel\s*=\s*["']?canonical[^>]*>/i) || [''])[0], 'href'),
    noindex: robotsMeta.includes('noindex'),
    words,
    scripts,
    emptyAppShell,
    jsonLdTypes: [...new Set(types)],
    jsonLdErrors,
    organization: org ? { type: [].concat(org['@type'])[0], name: org.name || null, sameAs: [].concat(org.sameAs || []).length } : null,
    headings: headings.length,
    questionHeadings: questions.length,
    lists: (html.match(/<(ul|ol)\b/gi) || []).length,
    tables: (html.match(/<table\b/gi) || []).length,
    modified: /dateModified|article:modified_time|<time\b/i.test(html),
  };
}

/** Light validation of an llms.txt body against llmstxt.org. */
export function checkLlmsTxt(text = '') {
  const lines = text.split(/\r?\n/);
  const links = text.match(/^\s*-\s*\[[^\]]+\]\([^)]+\)/gm) || [];
  return {
    title: /^#\s+\S/.test(lines.find((l) => l.trim()) || ''),
    summary: /^>\s*\S/m.test(text),
    sections: (text.match(/^##\s+\S/gm) || []).length,
    links: links.length,
  };
}

const isChallenge = (res) =>
  [401, 403, 429, 503].includes(res.status) || /just a moment|cf-chl|captcha|access denied|attention required/i.test(res.body.slice(0, 5000));

/**
 * Runs the audit. `fetcher(url, { userAgent })` must resolve to { status, body, headers } and is injectable for tests.
 */
export async function auditSite(input, { fetcher = defaultFetch, live = true } = {}) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  const origin = url.origin;
  const path = url.pathname + url.search;
  const checks = [];
  const add = (id, status, weight, message, fix = null) => checks.push({ id, status, weight, message, fix });

  const [page, robotsRes, llmsRes, llmsFullRes] = await Promise.all([
    fetcher(url.href, { userAgent: BROWSER_UA }),
    fetcher(`${origin}/robots.txt`, { userAgent: BROWSER_UA }).catch(() => ({ status: 0, body: '', headers: {} })),
    fetcher(`${origin}/llms.txt`, { userAgent: BROWSER_UA }).catch(() => ({ status: 0, body: '', headers: {} })),
    fetcher(`${origin}/llms-full.txt`, { userAgent: BROWSER_UA }).catch(() => ({ status: 0, body: '', headers: {} })),
  ]);

  // 1. robots.txt rules per agent
  const robots = robotsRes.status === 200 ? parseRobots(robotsRes.body) : parseRobots('');
  const agents = AGENTS.map((a) => ({ ...a, allowed: isAllowed(robots, a.token, path) }));
  const blockedCiting = agents.filter((a) => (a.kind === 'search' || a.kind === 'user') && !a.allowed);
  const blockedTraining = agents.filter((a) => a.kind === 'training' && !a.allowed);

  if (robotsRes.status !== 200) add('robots', 'warn', 4, `robots.txt not found (HTTP ${robotsRes.status}); everything is allowed by default.`, 'Add a robots.txt with your sitemap and clear rules for AI agents.');
  if (blockedCiting.length) {
    add('ai-search-access', 'fail', 25, `robots.txt blocks agents that cite sources in AI answers: ${blockedCiting.map((a) => a.token).join(', ')}.`,
      `Allow them:\n${blockedCiting.map((a) => `User-agent: ${a.token}`).join('\n')}\nAllow: /`);
  } else {
    add('ai-search-access', 'pass', 25, 'AI search and user-triggered agents may fetch this page.');
  }
  add('ai-training', blockedTraining.length ? 'info' : 'pass', 0, blockedTraining.length
    ? `Training crawlers blocked (your choice, does not stop citations): ${blockedTraining.map((a) => a.token).join(', ')}.`
    : 'Training crawlers are allowed.');

  // 2. Live access with AI user agents (firewalls/CDNs often block them even when robots.txt allows)
  const liveResults = [];
  if (live) {
    for (const token of LIVE_CHECK) {
      const agent = AGENTS.find((a) => a.token === token);
      try {
        const res = await fetcher(url.href, { userAgent: agent.ua });
        liveResults.push({ token, status: res.status, blocked: isChallenge(res) && !isChallenge(page) });
      } catch (e) {
        liveResults.push({ token, status: 0, blocked: true, error: e.message });
      }
    }
    // Control: a spoofed Googlebot request. Firewalls that verify bot IPs block it too, so a block of AI agents
    // from this machine doesn't prove the real (verified) crawlers are blocked.
    const google = AGENTS.find((a) => a.token === 'Googlebot');
    const control = await fetcher(url.href, { userAgent: google.ua }).then((res) => isChallenge(res) && !isChallenge(page)).catch(() => true);
    const blocked = liveResults.filter((r) => r.blocked);
    const list = blocked.map((r) => `${r.token} (HTTP ${r.status})`).join(', ');
    if (!blocked.length) {
      add('ai-live-access', 'pass', 20, 'Server answers AI user agents like a normal visitor.');
    } else if (control) {
      add('ai-live-access', 'info', 0, `Requests with AI user agents were blocked (${list}), but so was a spoofed Googlebot: the firewall verifies bot IPs, so real AI crawlers may still get through. Confirm in your server logs.`);
    } else {
      add('ai-live-access', 'fail', 20, `Server/CDN blocks AI agents that robots.txt allows: ${list}, while a spoofed Googlebot gets through.`,
        'Check your firewall/CDN/hosting bot rules (e.g. "Block AI bots", Imunify360, bot fight mode) and allow verified AI search agents.');
    }
  }

  // 3. Page content as an AI fetcher sees it (no JavaScript)
  const s = pageSignals(page.body);
  if (page.status >= 400) add('status', 'fail', 20, `Page answers HTTP ${page.status}.`);
  if (s.noindex || /noindex/i.test(page.headers['x-robots-tag'] || '')) add('noindex', 'fail', 10, 'Page is set to noindex.', 'Remove noindex if this page should appear in search and AI answers.');
  if (s.words < 150 || s.emptyAppShell) {
    add('server-html', 'fail', 20, `Only ${s.words} words of text in the server HTML${s.emptyAppShell ? ' and an empty app shell' : ''} — most AI fetchers don't run JavaScript.`,
      'Render the main content on the server (SSR/SSG/prerender).');
  } else {
    add('server-html', 'pass', 20, `${s.words} words of text available without JavaScript.`);
  }

  // 4. llms.txt
  if (llmsRes.status === 200 && !/<html/i.test(llmsRes.body.slice(0, 500))) {
    const l = checkLlmsTxt(llmsRes.body);
    const ok = l.title && l.summary && l.links > 0;
    add('llms-txt', ok ? 'pass' : 'warn', 10, ok
      ? `llms.txt found: ${l.sections} sections, ${l.links} links${llmsFullRes.status === 200 ? ', llms-full.txt too' : ''}.`
      : `llms.txt found but incomplete (${[!l.title && 'no # title', !l.summary && 'no > summary', !l.links && 'no links'].filter(Boolean).join(', ')}).`,
      ok ? null : 'Follow https://llmstxt.org: "# Name", "> one-line summary", "## Section" with "- [Title](url): note".');
  } else {
    add('llms-txt', 'warn', 10, 'No /llms.txt.', 'Publish an llms.txt (https://llmstxt.org) that lists your most useful pages.');
  }

  // 5. Entity signals
  if (s.jsonLdErrors) add('json-ld', 'fail', 5, `${s.jsonLdErrors} JSON-LD block(s) are invalid JSON.`);
  if (s.organization) {
    add('entity', s.organization.sameAs ? 'pass' : 'warn', 8, s.organization.sameAs
      ? `${s.organization.type} schema with ${s.organization.sameAs} sameAs profile(s).`
      : `${s.organization.type} schema without sameAs links.`, s.organization.sameAs ? null : 'Add sameAs links to your official profiles (Google Business Profile, LinkedIn, Facebook…).');
  } else {
    add('entity', 'warn', 8, 'No Organization/LocalBusiness JSON-LD found on this page.', 'Add Organization (or LocalBusiness) JSON-LD with name, url, logo and sameAs.');
  }

  // 6. Basics assistants quote from
  add('meta', s.title && s.description ? 'pass' : 'warn', 5, s.title && s.description ? 'Title and meta description present.' : `Missing ${[!s.title && 'title', !s.description && 'meta description'].filter(Boolean).join(' and ')}.`);
  add('lang', s.lang ? 'pass' : 'warn', 2, s.lang ? `<html lang="${s.lang}">.` : 'No lang attribute on <html>.');

  // 7. Answer-readiness
  const structured = s.questionHeadings > 0 || s.lists + s.tables > 0;
  add('answer-ready', structured ? 'pass' : 'warn', 5, structured
    ? `${s.questionHeadings} question-style headings, ${s.lists} lists, ${s.tables} tables.`
    : 'No question-style headings, lists or tables.', structured ? null : 'Use headings phrased as questions with a 2–3 sentence direct answer under each.');
  add('freshness', s.modified ? 'pass' : 'info', 0, s.modified ? 'Publication/update date found.' : 'No visible update date (dateModified, <time>).');

  // 8. Sitemap
  const hasSitemap = robots.sitemaps.length > 0 || (await fetcher(`${origin}/sitemap.xml`, { userAgent: BROWSER_UA }).then((r) => r.status === 200).catch(() => false));
  add('sitemap', hasSitemap ? 'pass' : 'warn', 5, hasSitemap ? 'XML sitemap found.' : 'No sitemap in robots.txt or at /sitemap.xml.');

  const total = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.4 : 0), 0);

  return {
    url: url.href,
    score: total ? Math.round((earned / total) * 100) : 0,
    status: page.status,
    agents: agents.map(({ token, vendor, kind, allowed }) => ({ token, vendor, kind, allowed })),
    live: liveResults,
    signals: s,
    checks,
  };
}

async function defaultFetch(url, { userAgent }) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers) };
}
