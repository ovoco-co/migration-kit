#!/usr/bin/env node
/**
 * pull-docs.js - Pull documentation from a website and convert to markdown.
 *
 * Usage:
 *   node tools/pull-docs.js <start-url> [options]
 *
 * Options:
 *   --outdir <dir>      Output directory (default: pulled-docs/<hostname>)
 *   --depth <n>         Max link-follow depth (default: 1, 0 = single page)
 *   --scope <prefix>    Only follow links starting with this URL prefix
 *                       (default: parent path of start URL)
 *   --selector <css>    CSS selector for main content (default: auto-detect)
 *   --delay <ms>        Delay between requests in ms (default: 500)
 *   --max <n>           Max pages to fetch (default: 200)
 *   --list              Just list discovered URLs, don't download
 *   --cookie <string>   Cookie header value for authenticated requests
 *   --header <k:v>      Extra header (repeatable)
 *
 * Examples:
 *   # Pull Atlassian Cloud Assets docs
 *   node tools/pull-docs.js \
 *     "https://support.atlassian.com/jira-service-management-cloud/docs/what-is-assets-in-jira-service-management/" \
 *     --outdir src/move/atlassian/cloud-assets-reference \
 *     --depth 2
 *
 *   # Pull a single page
 *   node tools/pull-docs.js "https://example.com/page" --depth 0
 *
 *   # List what would be pulled without downloading
 *   node tools/pull-docs.js "https://example.com/docs/" --list
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// --- Argument parsing ---

function parseArgs(argv) {
  const args = { headers: {} };
  const positional = [];
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--outdir') { args.outdir = argv[++i]; }
    else if (a === '--depth') { args.depth = parseInt(argv[++i], 10); }
    else if (a === '--scope') { args.scope = argv[++i]; }
    else if (a === '--selector') { args.selector = argv[++i]; }
    else if (a === '--delay') { args.delay = parseInt(argv[++i], 10); }
    else if (a === '--max') { args.max = parseInt(argv[++i], 10); }
    else if (a === '--list') { args.list = true; }
    else if (a === '--cookie') { args.headers['Cookie'] = argv[++i]; }
    else if (a === '--header') {
      const h = argv[++i];
      const sep = h.indexOf(':');
      if (sep > 0) args.headers[h.slice(0, sep).trim()] = h.slice(sep + 1).trim();
    }
    else if (!a.startsWith('-')) { positional.push(a); }
    else { console.error(`Unknown option: ${a}`); process.exit(1); }
    i++;
  }
  args.startUrl = positional[0];
  if (!args.startUrl) {
    console.error('Usage: node tools/pull-docs.js <start-url> [options]');
    console.error('Run with --help for full usage.');
    process.exit(1);
  }
  return args;
}

// --- Content selectors for known sites ---

const SITE_SELECTORS = [
  { match: 'support.atlassian.com', selector: 'article, [data-testid="content"], main .content, #content' },
  { match: 'developer.atlassian.com', selector: 'article, main .content, #content, .markdown-body' },
  { match: 'confluence.atlassian.com', selector: '#main-content, .wiki-content, #content' },
  { match: 'docs.adaptavist.com', selector: 'article, .content-body, main, #content' },
];

function detectSelector(url) {
  for (const s of SITE_SELECTORS) {
    if (url.includes(s.match)) return s.selector;
  }
  return 'article, main, #content, .content, [role="main"]';
}

// --- Turndown (HTML to Markdown) setup ---

function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  // Remove nav, footer, sidebar, breadcrumbs, feedback widgets
  td.remove(['nav', 'footer', 'aside', 'script', 'style', 'noscript',
    '[role="navigation"]', '[role="banner"]', '.breadcrumbs', '.feedback',
    '.page-metadata', '.sidebar', '.toc', '#disqus_thread']);

  // Keep tables readable
  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: function (content, node) {
      return ' ' + content.replace(/\n/g, ' ').trim() + ' |';
    }
  });

  td.addRule('tableRow', {
    filter: 'tr',
    replacement: function (content) {
      return '|' + content + '\n';
    }
  });

  td.addRule('table', {
    filter: 'table',
    replacement: function (content) {
      // Add header separator after first row
      const lines = content.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const cols = (lines[0].match(/\|/g) || []).length - 1;
        const sep = '|' + ' --- |'.repeat(cols);
        lines.splice(1, 0, sep);
      }
      return '\n\n' + lines.join('\n') + '\n\n';
    }
  });

  return td;
}

// --- URL helpers ---

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    // Remove trailing slash for consistency, except root
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function urlToFilename(url) {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || 'index';
  return slugify(decodeURIComponent(last));
}

// --- Fetching ---

async function fetchPage(url, headers) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; cmdb-kit-doc-pull/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      ...headers,
    },
    redirect: 'follow',
    timeout: 30000,
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  return resp.text();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Link extraction ---

function extractLinks($, pageUrl, scope) {
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    // Skip anchors, javascript, mailto
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

    const abs = normalizeUrl(href, pageUrl);
    if (!abs) return;

    // Must be within scope
    if (abs.startsWith(scope)) {
      links.add(abs);
    }
  });
  return links;
}

// --- Content extraction ---

function extractContent($, selectorList, url) {
  // Try each selector until we find content
  const selectors = selectorList.split(',').map(s => s.trim());
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      return el;
    }
  }
  // Fallback: body
  return $('body');
}

function extractTitle($) {
  // Try common title patterns
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;

  const title = $('title').text().trim();
  if (title) return title.split('|')[0].split('-')[0].trim();

  return 'Untitled';
}

// --- Main crawl ---

async function crawl(config) {
  const {
    startUrl,
    outdir,
    depth = 1,
    scope,
    selector,
    delay = 500,
    max = 200,
    list = false,
    headers = {},
  } = config;

  const parsedStart = new URL(startUrl);
  const effectiveScope = scope || (() => {
    // Default scope: parent path of start URL
    const parts = parsedStart.pathname.split('/').filter(Boolean);
    if (parts.length > 1) parts.pop();
    return parsedStart.origin + '/' + parts.join('/');
  })();
  const effectiveSelector = selector || detectSelector(startUrl);

  console.log(`Start:    ${startUrl}`);
  console.log(`Scope:    ${effectiveScope}`);
  console.log(`Selector: ${effectiveSelector}`);
  console.log(`Depth:    ${depth}`);
  console.log(`Max:      ${max}`);
  console.log();

  const td = createTurndown();
  const visited = new Map(); // url -> { title, filename }
  const queue = [{ url: normalizeUrl(startUrl, startUrl), depth: 0 }];
  const seen = new Set([queue[0].url]);
  const pages = [];

  while (queue.length > 0 && pages.length < max) {
    const { url, depth: d } = queue.shift();

    process.stdout.write(`[${pages.length + 1}] ${url} ... `);

    try {
      const html = await fetchPage(url, headers);
      const $ = cheerio.load(html);
      const title = extractTitle($);
      const contentEl = extractContent($, effectiveSelector, url);

      // Convert to markdown
      const contentHtml = contentEl.html() || '';
      let md = td.turndown(contentHtml);

      // Clean up excessive blank lines
      md = md.replace(/\n{3,}/g, '\n\n').trim();

      // Prepend title
      md = `# ${title}\n\n${md}`;

      const filename = urlToFilename(url);
      pages.push({ url, title, filename, md, depth: d });
      visited.set(url, { title, filename });

      console.log(`${title} (${md.length} chars)`);

      // Extract links for next depth level
      if (d < depth) {
        const links = extractLinks($, url, effectiveScope);
        for (const link of links) {
          if (!seen.has(link)) {
            seen.add(link);
            queue.push({ url: link, depth: d + 1 });
          }
        }
      }

      if (queue.length > 0) await sleep(delay);

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  console.log(`\nFetched ${pages.length} pages.`);

  if (list) {
    console.log('\nDiscovered URLs:');
    for (const p of pages) {
      console.log(`  ${p.url}`);
    }
    // Also show queued but not fetched
    if (queue.length > 0) {
      console.log(`\n${queue.length} more URLs in queue (not fetched):`);
      for (const q of queue.slice(0, 20)) {
        console.log(`  ${q.url}`);
      }
      if (queue.length > 20) console.log(`  ... and ${queue.length - 20} more`);
    }
    return;
  }

  // Deduplicate filenames
  const usedNames = new Set();
  for (const p of pages) {
    let name = p.filename;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${p.filename}-${i++}`;
    }
    usedNames.add(name);
    p.filename = name;
  }

  // Write files
  const effectiveOutdir = outdir || path.join('pulled-docs', parsedStart.hostname);
  fs.mkdirSync(effectiveOutdir, { recursive: true });

  for (const p of pages) {
    const filepath = path.join(effectiveOutdir, `${p.filename}.md`);
    fs.writeFileSync(filepath, p.md, 'utf8');
  }

  // Write INDEX.md
  const indexLines = [
    `# Documentation Index`,
    ``,
    `Downloaded from: ${startUrl}`,
    ``,
    `Pages: ${pages.length}`,
    ``,
    ``,
  ];
  for (const p of pages) {
    indexLines.push(`- [${p.title}](${p.filename}.md)`);
  }
  fs.writeFileSync(path.join(effectiveOutdir, 'INDEX.md'), indexLines.join('\n') + '\n', 'utf8');

  console.log(`\nWritten to ${effectiveOutdir}/`);
  console.log(`  ${pages.length} markdown files + INDEX.md`);
}

// --- Entry point ---

const args = parseArgs(process.argv);
crawl(args).catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
