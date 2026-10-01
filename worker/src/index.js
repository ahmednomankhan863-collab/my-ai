// AI Hub private tool gateway — Cloudflare Worker
// Secrets required: APP_TOKEN and GEMINI_API_KEY
const MAX_BODY = 64_000;
const MAX_PAGE = 900_000;
const MODEL = "gemini-3.8-flash";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers }
});

function cors(origin, env) {
  return {
    "access-control-allow-origin": origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store"
  };
}

async function sameSecret(a = "", b = "") {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let d = xa.length ^ ya.length;
  for (let i = 0; i < Math.min(xa.length, ya.length); i++) d |= xa[i] ^ ya[i];
  return d === 0;
}

function publicUrl(value) {
  const u = new URL(value);
  if (u.protocol !== "https:") throw new Error("Only HTTPS pages are allowed");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("Private hosts are blocked");
  if (/^(0|10|127|169\.254|192\.168)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) throw new Error("Private addresses are blocked");
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) throw new Error("Private addresses are blocked");
  u.username = ""; u.password = ""; u.hash = "";
  return u;
}

async function limitedText(response, limit = MAX_PAGE) {
  const stated = Number(response.headers.get("content-length") || 0);
  if (stated > limit) throw new Error("Page is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Page is too large");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { all.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

const entities = s => s
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));

function cleanHtml(html) {
  const title = entities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, " ")).trim();
  const text = entities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|article|section|main|header|footer|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim());
  return { title, text: text.slice(0, 24_000) };
}

async function directRead(target) {
  let u = publicUrl(target);
  for (let redirects = 0; redirects < 3; redirects++) {
    const r = await fetch(u, {
      redirect: "manual",
      headers: { "user-agent": "AI-Hub-Reader/1.0", "accept": "text/html,text/plain,application/json" },
      signal: AbortSignal.timeout(12_000)
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location = r.headers.get("location");
      if (!location) throw new Error("Invalid redirect");
      u = publicUrl(new URL(location, u).toString());
      continue;
    }
    if (!r.ok) throw new Error(`Page returned ${r.status}`);
    const type = (r.headers.get("content-type") || "").toLowerCase();
    if (!/text\/(html|plain)|application\/(json|xhtml\+xml)/.test(type)) throw new Error("Unsupported page type");
    const raw = await limitedText(r);
    const out = /html|xhtml/.test(type) ? cleanHtml(raw) : { title: "", text: raw.slice(0, 24_000) };
    return { ...out, url: u.toString(), retrievedAt: new Date().toISOString() };
  }
  throw new Error("Too many redirects");
}

async function browserMarkdown(env, target) {
  if (!env.BROWSER?.quickAction) throw new Error("Browser reader is not configured");
  const u = publicUrl(target);
  const result = await env.BROWSER.quickAction("markdown", { url: u.toString() });
  let text;
  if (result instanceof Response) text = await limitedText(result, 500_000);
  else text = typeof result === "string" ? result : result?.markdown || JSON.stringify(result);
  return { title: "", text: text.slice(0, 24_000), url: u.toString(), retrievedAt: new Date().toISOString() };
}

async function readPage(env, target) {
  let direct;
  try {
    direct = await directRead(target);
    if (direct.text.length >= 300 || !env.BROWSER) return direct;
  } catch (error) {
    if (!env.BROWSER) throw error;
  }
  try { return await browserMarkdown(env, target); }
  catch (error) { if (direct) return direct; throw error; }
}

function decodeSearchUrl(value) {
  try {
    const u = new URL(entities(value), "https://duckduckgo.com");
    const actual = u.searchParams.get("uddg");
    return publicUrl(actual ? decodeURIComponent(actual) : u.toString()).toString();
  } catch { return ""; }
}

async function searchWeb(query) {
  const u = new URL("https://html.duckduckgo.com/html/");
  u.searchParams.set("q", query.slice(0, 300));
  const r = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; AI-Hub-Research/1.0)", "accept": "text/html" },
    signal: AbortSignal.timeout(12_000)
  });
  if (!r.ok) throw new Error("Search is temporarily unavailable");
  const html = await limitedText(r, 600_000), results = [], re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 5) {
    const url = decodeSearchUrl(m[1]); if (!url) continue;
    const title = entities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const snippet = entities((m[3] || m[4] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (title) results.push({ title, url, snippet: snippet.slice(0, 500) });
  }
  if (!results.length) throw new Error("No search results were available");
  return results;
}

async function research(env, query) {
  const results = await searchWeb(query);
  const pages = await Promise.all(results.slice(0, 2).map(async item => {
    try { return { ...item, page: await readPage(env, item.url) }; }
    catch { return item; }
  }));
  return { query, searchedAt: new Date().toISOString(), results: [...pages, ...results.slice(2)] };
}

async function bodyJson(request, limit = MAX_BODY) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw new Error("Request is too large");
  const text = await request.text();
  if (text.length > limit) throw new Error("Request is too large");
  return JSON.parse(text || "{}");
}

async function chatProxy(request, env, headers) {
  const body = await bodyJson(request, 1_500_000);
  body.model = MODEL;
  body.messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  body.max_tokens = Math.min(Number(body.max_tokens) || 1800, 2500);
  delete body.tools; delete body.tool_choice; delete body.n;
  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${env.GEMINI_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000)
  });
  if (!upstream.ok) {
    upstream.body?.cancel();
    const status = [400, 401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
    return json({ error: { message: status === 429 ? "Model rate limit reached" : "AI provider request failed" } }, status, headers);
  }
  const outHeaders = new Headers(headers);
  outHeaders.set("content-type", upstream.headers.get("content-type") || "application/json");
  return new Response(upstream.body, { status: 200, headers: outHeaders });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const headers = cors(origin, env);
    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({ error: "Origin not allowed" }, 403, headers);
    const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.APP_TOKEN || !(await sameSecret(supplied, env.APP_TOKEN))) return json({ error: "Unauthorized" }, 401, headers);
    const url = new URL(request.url);
    const rateKey = supplied.slice(0, 12) + ":" + url.pathname;
    if (env.RATE_LIMITER) {
      const allowed = await env.RATE_LIMITER.limit({ key: rateKey });
      if (!allowed.success) return json({ error: "Too many requests" }, 429, headers);
    }
    try {
      if (url.pathname === "/health") return json({ ok: true, model: MODEL, tools: ["read", "search", "research"] }, 200, headers);
      if (url.pathname === "/v1/models" && request.method === "GET") return json({ object: "list", data: [{ id: MODEL, object: "model", architecture: { input_modalities: ["text", "image"] } }] }, 200, headers);
      if (url.pathname === "/v1/chat/completions" && request.method === "POST") return chatProxy(request, env, headers);
      if (request.method !== "POST") return json({ error: "Not found" }, 404, headers);
      const body = await bodyJson(request);
      if (url.pathname === "/tools/read") return json(await readPage(env, body.url), 200, headers);
      if (url.pathname === "/tools/search") return json({ query: body.query, results: await searchWeb(String(body.query || "")) }, 200, headers);
      if (url.pathname === "/tools/research") return json(await research(env, String(body.query || "")), 200, headers);
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Request failed" }, 400, headers);
    }
  }
};
