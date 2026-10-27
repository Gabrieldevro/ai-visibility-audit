<h1 align="center">🤖🔍 ai-visibility-audit</h1>

<p align="center"><b>Can ChatGPT, Claude and Perplexity actually find and cite your site?</b><br>
One command checks robots.txt rules per AI agent, firewall/CDN blocks, server-rendered content, <code>llms.txt</code> and entity schema — and tells you exactly what to fix. Zero dependencies.<br>
<i>Verifică dacă ChatGPT, Claude și Perplexity îți pot citi și cita site-ul.</i></p>

<p align="center">
<img alt="tests" src="https://github.com/Gabrieldevro/ai-visibility-audit/actions/workflows/test.yml/badge.svg">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white">
<img alt="deps" src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square">
<img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
</p>

---

```
$ npx github:Gabrieldevro/ai-visibility-audit https://example.com

https://example.com/
  AI visibility score: 69/100

  robots.txt
  AI search   ✔ OAI-SearchBot  ✔ Claude-SearchBot  ✔ PerplexityBot
  User fetch  ✔ ChatGPT-User  ✔ Claude-User  ✔ Perplexity-User
  Training    ✔ GPTBot  ✔ ClaudeBot  ✔ Google-Extended  ✔ Applebot-Extended  ✔ CCBot

  ✔ AI search and user-triggered agents may fetch this page.
  ✖ Server/CDN blocks AI agents that robots.txt allows: OAI-SearchBot (HTTP 403), ChatGPT-User (HTTP 403),
    PerplexityBot (HTTP 403), while a spoofed Googlebot gets through.
      → Check your firewall/CDN/hosting bot rules and allow verified AI search agents.
  ✔ 1328 words of text available without JavaScript.
  ▲ No /llms.txt.
  ▲ Organization schema without sameAs links.
  ✔ XML sitemap found.
```

That example is real: the site's `robots.txt` welcomed AI crawlers, but the **hosting firewall returned 403** to them. Nothing in the site's code showed it. This is surprisingly common on shared hosting and CDNs with "block AI bots" switches — and it silently removes you from AI answers.

## What it checks

| Check | Why it matters |
|---|---|
| **robots.txt per agent** — OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, CCBot | Separates **search/user agents** (needed to be cited) from **training crawlers** (a separate choice). RFC 9309 matching: most specific group, longest rule, `*` and `$`. |
| **Live access** with real AI user-agent strings, plus a Googlebot control request | Finds firewall, WAF, CDN and hosting rules that block AI agents even when robots.txt allows them, and tells apart IP-verifying firewalls (inconclusive) from plain user-agent blocks. |
| **Server-rendered text** | Most AI fetchers don't run JavaScript. Flags empty app shells (`#root`, `#__next`) and pages with almost no text in the HTML. |
| **llms.txt / llms-full.txt** | Presence and basic format per [llmstxt.org](https://llmstxt.org). |
| **Entity schema** | Organization / LocalBusiness JSON-LD and `sameAs` links, invalid JSON-LD. |
| **Answer-readiness** | Question-style headings, lists, tables, update dates. |
| **Basics** | HTTP status, `noindex` (meta and header), title, description, `lang`, sitemap. |

## Usage

```bash
npx github:Gabrieldevro/ai-visibility-audit https://example.com https://example.com/pricing
npx github:Gabrieldevro/ai-visibility-audit example.com --json          # machine-readable
npx github:Gabrieldevro/ai-visibility-audit example.com --no-live       # no requests with AI user agents
npx github:Gabrieldevro/ai-visibility-audit example.com --min-score=70  # exit 2 below 70 (CI)
```

As a library:

```js
import { auditSite } from 'ai-visibility-audit';
import { parseRobots, isAllowed } from 'ai-visibility-audit/robots';

const report = await auditSite('https://example.com');
report.score;    // 0–100
report.agents;   // [{ token: 'OAI-SearchBot', kind: 'search', allowed: true }, …]
report.checks;   // [{ id, status: 'pass'|'warn'|'fail'|'info', message, fix }]

isAllowed(parseRobots(robotsTxt), 'GPTBot', '/blog/post');
```

### In CI (GitHub Actions)

```yaml
- run: npx -y github:Gabrieldevro/ai-visibility-audit https://staging.example.com --min-score=70
```

## Fixing what it finds

- **Blocked by robots.txt** → it prints the `User-agent` lines to add.
- **Blocked by the server** → look for "block AI bots" / "AI crawl control" in your CDN, Imunify360 or ModSecurity rules in cPanel, LiteSpeed/Apache user-agent rules, or ask your host to allow-list the AI search agents.
- **No server-rendered text** → enable SSR/SSG or prerendering for public pages.
- **No llms.txt** → write one ([format](https://llmstxt.org)); on Laravel use [laravel-llms-txt](https://github.com/Gabrieldevro/laravel-llms-txt).
- **No entity schema** → add Organization JSON-LD with `sameAs`; the [`/seo:schema` skill](https://github.com/Gabrieldevro/claude-seo-skills) writes it for you in Claude Code.

## Notes

- Live checks send one request per tested agent (4) plus one control request. Use `--no-live` if you don't want that.
- A spoofed user agent comes from your IP, not the vendor's. If the Googlebot control is blocked too, the result is reported as inconclusive rather than as a failure.
- Agent names change; PRs to `src/agents.js` are welcome.

---

## 🇷🇴 Pe scurt, în română

Unealtă de linie de comandă care verifică dacă **ChatGPT, Claude și Perplexity** îți pot accesa și cita site-ul: regulile din robots.txt pentru fiecare robot AI, blocările făcute de hosting/firewall (frecvente pe hostingul shared din România), textul disponibil fără JavaScript, `llms.txt` și schema firmei. Primești un scor din 100 și remedierile exacte.

```bash
npx github:Gabrieldevro/ai-visibility-audit https://site-ul-tau.ro
```

## License

MIT © [Gabriel Dev](https://gabrieldev.eu)

If it found something on your site, a ⭐ helps others find it too.
