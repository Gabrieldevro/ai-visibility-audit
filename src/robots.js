// robots.txt parsing and matching (RFC 9309): groups by user-agent, longest match wins, Allow wins ties,
// `*` and `$` wildcards. No dependencies.

/** @returns {{ groups: { agents: string[], rules: { allow: boolean, path: string }[] }[], sitemaps: string[] }} */
export function parseRobots(text = '') {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue;
      // An empty Disallow allows everything; ignore it.
      if (value !== '' || key === 'allow') current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }

  return { groups, sitemaps };
}

/** The group that applies to an agent: the most specific matching product token, else `*`. */
export function groupFor(robots, agent) {
  const token = agent.toLowerCase();
  const matching = robots.groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
  if (matching.length) {
    // Several groups for the same agent are merged.
    return { agents: [token], rules: matching.flatMap((g) => g.rules), explicit: true };
  }
  const star = robots.groups.filter((g) => g.agents.includes('*'));
  return { agents: ['*'], rules: star.flatMap((g) => g.rules), explicit: false };
}

function toRegex(pattern) {
  const escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + (escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped.replace(/\$$/, '$')));
}

/** Whether `agent` may fetch `path` (path + query). */
export function isAllowed(robots, agent, path = '/') {
  const { rules } = groupFor(robots, agent);
  let best = null;
  for (const rule of rules) {
    if (rule.path === '' && rule.allow) continue;
    if (!toRegex(rule.path).test(path)) continue;
    const length = rule.path.replace(/[*$]/g, '').length;
    if (!best || length > best.length || (length === best.length && rule.allow && !best.allow)) {
      best = { length, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}
