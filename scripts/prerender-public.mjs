import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const routes = JSON.parse(await readFile(path.join(root, "src/seo/publicRoutes.json"), "utf8"));
const baseHtml = await readFile(path.join(dist, "index.html"), "utf8");
const origin = "https://www.xcrowhub.com";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceMeta(html, attribute, key, value) {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`<meta([^>]*${attribute}="${key}"[^>]*)>`, "i");
  return html.replace(pattern, (match) => match.replace(/content="[^"]*"/i, `content="${escaped}"`));
}

function staticContent(route, page) {
  const sections = page.sections ?? [];
  return `
      <main data-static-route="${escapeHtml(route)}">
        <header>
          <p>${escapeHtml(page.eyebrow)}</p>
          <h1>${escapeHtml(page.heading)}</h1>
          <p>${escapeHtml(page.summary)}</p>
        </header>
        <nav aria-label="Public pages">
          <a href="/">Home</a> · <a href="/marketplace">Marketplace</a> · <a href="/how-it-works">How it works</a> · <a href="/docs">Docs</a> · <a href="/support">Support</a>
        </nav>
        ${sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`).join("\n        ")}
        <footer><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>
      </main>
    `;
}

function render(route, page) {
  const canonical = `${origin}${route === "/" ? "/" : route}`;
  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "property", "og:title", page.title);
  html = replaceMeta(html, "property", "og:description", page.description);
  html = replaceMeta(html, "property", "og:url", canonical);
  html = replaceMeta(html, "name", "twitter:title", page.title);
  html = replaceMeta(html, "name", "twitter:description", page.description);
  html = html.replace(/\s*<link rel="canonical"[^>]*>/gi, "");
  html = html.replace("</head>", `    <link rel="canonical" href="${canonical}" />\n  </head>`);

  if (route !== "/") {
    html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");
    const structuredData = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.heading,
      url: canonical,
      description: page.description,
      isPartOf: { "@type": "WebSite", name: "XcrowHub", url: `${origin}/` },
    }).replaceAll("<", "\\u003c");
    html = html.replace("</head>", `    <script type="application/ld+json">${structuredData}</script>\n  </head>`);
    html = html.replace(
      /<!-- STATIC_ROUTE_CONTENT_START -->[\s\S]*?<!-- STATIC_ROUTE_CONTENT_END -->/,
      `<!-- STATIC_ROUTE_CONTENT_START -->${staticContent(route, page)}<!-- STATIC_ROUTE_CONTENT_END -->`,
    );
  }

  return html;
}

await mkdir(path.join(dist, "_seo"), { recursive: true });

for (const [route, page] of Object.entries(routes)) {
  const html = render(route, page);
  if (route === "/") {
    await writeFile(path.join(dist, "index.html"), html);
    continue;
  }

  const slug = route.slice(1);
  await writeFile(path.join(dist, "_seo", `${slug}.html`), html);
  await mkdir(path.join(dist, slug), { recursive: true });
  await writeFile(path.join(dist, slug, "index.html"), html);
}

console.log(`Generated crawlable HTML for ${Object.keys(routes).length} public routes.`);
