/**
 * Shared API client for Jira DC and Cloud instances.
 *
 * Reads connection config from .migrationrc.json at the repo root.
 * Handles authentication, pagination, and rate limiting.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.migrationrc.json';
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

function loadConfig() {
  const configPath = path.resolve(__dirname, '..', '..', CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    console.error(`Missing ${CONFIG_FILE} in repo root. Copy from template:\n`);
    console.error(JSON.stringify({
      source: {
        type: 'dc',
        baseUrl: 'https://jira-source.example.com',
        auth: { username: '', token: '' },
        assetsBaseUrl: 'https://jira-source.example.com/rest/assets/1.0',
      },
      target: {
        type: 'cloud',
        baseUrl: 'https://example.atlassian.net',
        auth: { email: '', token: '' },
        assetsWorkspaceId: '',
        assetsBaseUrl: 'https://api.atlassian.com/jsm/assets/workspace/{workspaceId}/v1',
      },
      outputDir: './output',
    }, null, 2));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function buildAuthHeader(instance) {
  if (instance.type === 'cloud') {
    const { email, token } = instance.auth;
    return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  }
  // DC: username + token (or password)
  const { username, token } = instance.auth;
  return 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64');
}

async function request(instance, method, urlPath, body, extraHeaders) {
  const base = urlPath.startsWith('http') ? '' : instance.baseUrl;
  const url = base ? `${base}${urlPath}` : urlPath;
  const headers = {
    Authorization: buildAuthHeader(instance),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  let attempt = 0;
  while (true) {
    attempt++;
    const opts = { method, headers };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    console.error(`  ${method} ${url}${attempt > 1 ? ` (retry ${attempt})` : ''}`);

    const resp = await fetch(url, opts);

    // Rate limiting (Cloud 429)
    if (resp.status === 429 && attempt <= MAX_RETRIES) {
      const retryAfter = resp.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.error(`  Rate limited. Waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${method} ${url}: ${text.slice(0, 500)}`);
    }

    // Some endpoints return 204 No Content
    if (resp.status === 204) return null;

    return resp.json();
  }
}

/**
 * Paginate through a Jira REST API endpoint.
 *
 * DC uses startAt/maxResults (offset-based).
 * Cloud uses startAt/maxResults for most Jira endpoints.
 * Assets Cloud uses cursor-based pagination on some endpoints.
 *
 * @param {object} instance - Source or target config
 * @param {string} urlPath - API path (e.g., /rest/api/2/field)
 * @param {object} params - Query params (merged with pagination params)
 * @param {string} resultsKey - Key in response containing the array (e.g., 'issues', 'values')
 * @param {number} pageSize - Results per page (default 50)
 * @returns {Array} All results concatenated
 */
async function paginate(instance, urlPath, params = {}, resultsKey = null, pageSize = 50) {
  const all = [];
  let startAt = 0;

  while (true) {
    const query = new URLSearchParams({
      ...params,
      startAt: String(startAt),
      maxResults: String(pageSize),
    });
    const sep = urlPath.includes('?') ? '&' : '?';
    const data = await request(instance, 'GET', `${urlPath}${sep}${query}`);

    if (!data) break;

    // If response is an array, return it directly (no pagination)
    if (Array.isArray(data)) {
      return data;
    }

    const items = resultsKey ? data[resultsKey] : (data.values || data.issues || data);
    if (!Array.isArray(items) || items.length === 0) break;

    all.push(...items);

    // Check if we've fetched everything
    const total = data.total;
    if (total !== undefined && all.length >= total) break;

    // If fewer results than page size, we're done
    if (items.length < pageSize) break;

    startAt += items.length;
  }

  return all;
}

function get(instance, urlPath) {
  return request(instance, 'GET', urlPath);
}

function post(instance, urlPath, body) {
  return request(instance, 'POST', urlPath, body);
}

function put(instance, urlPath, body) {
  return request(instance, 'PUT', urlPath, body);
}

function del(instance, urlPath) {
  return request(instance, 'DELETE', urlPath);
}

/**
 * Ensure the output directory exists and return the full path for a filename.
 */
function outputPath(config, ...segments) {
  const dir = path.resolve(config.outputDir || './output', ...segments.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, segments[segments.length - 1]);
}

/**
 * Write JSON to an output file.
 */
function writeOutput(config, data, ...segments) {
  const filePath = outputPath(config, ...segments);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote ${filePath} (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
  return filePath;
}

/**
 * Parse common CLI flags.
 * Returns { flags, positional }.
 */
function parseFlags(argv) {
  const flags = {};
  const positional = [];
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
    i++;
  }
  return { flags, positional };
}

module.exports = {
  loadConfig,
  get,
  post,
  put,
  del,
  paginate,
  request,
  outputPath,
  writeOutput,
  parseFlags,
};
