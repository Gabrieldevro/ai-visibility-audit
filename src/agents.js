// AI user agents. "search" and "user" agents decide whether a site can be found and cited in AI answers;
// "training" agents only decide whether content is used to train models.

export const AGENTS = [
  { token: 'OAI-SearchBot', vendor: 'OpenAI', kind: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot' },
  { token: 'ChatGPT-User', vendor: 'OpenAI', kind: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' },
  { token: 'GPTBot', vendor: 'OpenAI', kind: 'training', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot' },
  { token: 'Claude-SearchBot', vendor: 'Anthropic', kind: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +https://www.anthropic.com' },
  { token: 'Claude-User', vendor: 'Anthropic', kind: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0; +https://www.anthropic.com' },
  { token: 'ClaudeBot', vendor: 'Anthropic', kind: 'training', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com' },
  { token: 'PerplexityBot', vendor: 'Perplexity', kind: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
  { token: 'Perplexity-User', vendor: 'Perplexity', kind: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' },
  { token: 'Google-Extended', vendor: 'Google', kind: 'training', ua: null },
  { token: 'Applebot-Extended', vendor: 'Apple', kind: 'training', ua: null },
  { token: 'CCBot', vendor: 'Common Crawl', kind: 'training', ua: 'CCBot/2.0 (https://commoncrawl.org/faq/)' },
  { token: 'Googlebot', vendor: 'Google', kind: 'search', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { token: 'Bingbot', vendor: 'Microsoft', kind: 'search', ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
];

// Agents whose live access we test with a real request (one each, to stay polite).
export const LIVE_CHECK = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'];
