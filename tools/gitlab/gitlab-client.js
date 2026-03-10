/**
 * GitLab API client for migration tools.
 *
 * Handles authentication, pagination (keyset and offset), and rate limiting
 * for GitLab self-managed and GitLab.com instances.
 *
 * Configuration is read from .migrationrc.json under the "gitlab" key.
 */

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

function loadGitLabConfig() {
  const configPath = path.resolve(__dirname, '..', '..', '.migrationrc.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Missing .migrationrc.json in repo root.`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.gitlab) {
    console.error('Missing "gitlab" key in .migrationrc.json. Add:\n');
    console.error(JSON.stringify({
      gitlab: {
        baseUrl: 'https://gitlab.example.com',
        token: 'glpat-xxxxxxxxxxxxxxxxxxxx',
      },
    }, null, 2));
    process.exit(1);
  }
  return config;
}

function buildHeaders(gitlabConfig) {
  return {
    'PRIVATE-TOKEN': gitlabConfig.token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function glRequest(gitlabConfig, method, urlPath, body) {
  const base = urlPath.startsWith('http') ? '' : gitlabConfig.baseUrl;
  const url = base ? `${base}${urlPath}` : urlPath;
  const headers = buildHeaders(gitlabConfig);

  let attempt = 0;
  while (true) {
    attempt++;
    const opts = { method, headers };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    console.error(`  ${method} ${url}${attempt > 1 ? ` (retry ${attempt})` : ''}`);

    const resp = await fetch(url, opts);

    // Rate limiting (429)
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

    if (resp.status === 204) return { data: null, headers: resp.headers };

    const data = await resp.json();
    return { data, headers: resp.headers };
  }
}

/**
 * Paginate through GitLab API using Link header (keyset/offset pagination).
 *
 * GitLab returns pagination info via Link headers and X-Total/X-Total-Pages.
 */
async function glPaginate(gitlabConfig, urlPath, params = {}, pageSize = 100) {
  const all = [];
  const query = new URLSearchParams({ ...params, per_page: String(pageSize) });
  let url = `${urlPath}?${query}`;

  while (url) {
    const { data, headers } = await glRequest(gitlabConfig, 'GET', url);

    if (!data) break;
    if (Array.isArray(data)) {
      all.push(...data);
    } else {
      all.push(data);
    }

    // Parse Link header for next page
    const linkHeader = headers.get('link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return all;
}

async function glGet(gitlabConfig, urlPath) {
  const { data } = await glRequest(gitlabConfig, 'GET', urlPath);
  return data;
}

async function glPost(gitlabConfig, urlPath, body) {
  const { data } = await glRequest(gitlabConfig, 'POST', urlPath, body);
  return data;
}

async function glPut(gitlabConfig, urlPath, body) {
  const { data } = await glRequest(gitlabConfig, 'PUT', urlPath, body);
  return data;
}

module.exports = {
  loadGitLabConfig,
  glRequest,
  glPaginate,
  glGet,
  glPost,
  glPut,
};
