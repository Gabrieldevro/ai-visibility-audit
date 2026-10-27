import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../src/robots.js';
import { auditSite, checkLlmsTxt, pageSignals } from '../src/audit.js';

test('robots: specific group beats *, longest match wins, Allow wins ties', () => {
  const r = parseRobots(`
User-agent: *
Disallow: /admin
Allow: /admin/public

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: OAI-SearchBot
Allow: /
Disallow: /*.pdf$

Sitemap: https://x.test/sitemap.xml`);

  assert.equal(isAllowed(r, 'ClaudeBot', '/'), true);
  assert.equal(isAllowed(r, 'ClaudeBot', '/admin/users'), false);
  assert.equal(isAllowed(r, 'ClaudeBot', '/admin/public/x'), true);
  assert.equal(isAllowed(r, 'GPTBot', '/blog'), false);
  assert.equal(isAllowed(r, 'CCBot', '/'), false);
  assert.equal(isAllowed(r, 'OAI-SearchBot', '/guide'), true);
  assert.equal(isAllowed(r, 'OAI-SearchBot', '/file.pdf'), false);
  assert.equal(isAllowed(r, 'OAI-SearchBot', '/file.pdf?x=1'), true);
  assert.deepEqual(r.sitemaps, ['https://x.test/sitemap.xml']);
});

test('robots: empty file and empty Disallow allow everything', () => {
  assert.equal(isAllowed(parseRobots(''), 'GPTBot', '/x'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), 'GPTBot', '/x'), true);
});

test('llms.txt validation', () => {
  assert.deepEqual(checkLlmsTxt('# Shop\n\n> Toys in Romania\n\n## Pages\n\n- [Shipping](https://x.test/s): costs\n'), { title: true, summary: true, sections: 1, links: 1 });
  assert.equal(checkLlmsTxt('hello').title, false);
});

test('page signals from raw HTML', () => {
  const s = pageSignals(`<html lang="ro"><head><title>T</title><meta name="description" content="D">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X","sameAs":["https://fb.com/x"]}]}</script></head>
    <body><h1>X</h1><h2>Cât costă livrarea?</h2><ul><li>a</li></ul><script>var hidden = "not text";</script><p>${'word '.repeat(200)}</p></body></html>`);
  assert.equal(s.lang, 'ro');
  assert.equal(s.organization.sameAs, 1);
  assert.equal(s.questionHeadings, 1);
  assert.ok(s.words > 200);
  assert.ok(!/hidden/.test(JSON.stringify(s)));
});

const site = (overrides = {}) => {
  const pages = {
    'https://shop.test/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\nSitemap: https://shop.test/sitemap.xml' },
    'https://shop.test/llms.txt': { status: 200, body: '# Shop\n\n> Toys\n\n## Pages\n\n- [A](https://shop.test/a)\n' },
    'https://shop.test/llms-full.txt': { status: 404, body: '' },
    'https://shop.test/': { status: 200, body: `<html lang="en"><head><title>Shop</title><meta name="description" content="d"><script type="application/ld+json">{"@type":"Organization","name":"Shop","sameAs":["https://x"]}</script></head><body><h2>How do returns work?</h2><p>${'text '.repeat(300)}</p><time>2026</time></body></html>` },
    ...overrides,
  };
  return async (url, { userAgent }) => {
    const hit = typeof pages[url] === 'function' ? await pages[url](userAgent) : pages[url];
    return { headers: {}, ...(hit || { status: 404, body: 'not found' }) };
  };
};

test('a well-prepared site scores 100', async () => {
  const r = await auditSite('https://shop.test/', { fetcher: site() });
  assert.equal(r.score, 100);
  assert.ok(r.checks.every((c) => c.status === 'pass'));
});

test('blocked AI search agents and a CDN challenge are reported', async () => {
  const r = await auditSite('shop.test', {
    fetcher: site({
      'https://shop.test/robots.txt': { status: 200, body: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /' },
      'https://shop.test/': (ua) => (/PerplexityBot/.test(ua)
        ? { status: 403, body: '<title>Just a moment...</title>' }
        : site()('https://shop.test/', { userAgent: ua })),
    }),
  });

  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(byId['ai-search-access'].status, 'fail');
  assert.match(byId['ai-search-access'].fix, /User-agent: OAI-SearchBot/);
  assert.equal(byId['ai-training'].status, 'info');
  assert.equal(byId['ai-live-access'].status, 'fail');
  assert.match(byId['ai-live-access'].message, /PerplexityBot \(HTTP 403\)/);
  assert.ok(r.score < 60);
});

test('client-side rendered page is flagged', async () => {
  const r = await auditSite('https://shop.test/', {
    live: false,
    fetcher: site({ 'https://shop.test/': { status: 200, body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' } }),
  });
  const check = r.checks.find((c) => c.id === 'server-html');
  assert.equal(check.status, 'fail');
  assert.match(check.message, /empty app shell/);
});
