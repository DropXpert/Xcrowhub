import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import routeData from "@/seo/publicRoutes.json";

type PublicRoute = keyof typeof routeData;

const SITE_ORIGIN = "https://www.xcrowhub.com";

function upsertMeta(selector: string, attribute: "name" | "property", key: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

export function PublicSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
    const key = (normalizedPath in routeData ? normalizedPath : "/") as PublicRoute;
    const page = routeData[key];
    const canonical = `${SITE_ORIGIN}${key === "/" ? "/" : key}`;

    document.title = page.title;
    upsertMeta('meta[name="description"]', "name", "description", page.description);
    upsertMeta('meta[property="og:title"]', "property", "og:title", page.title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", page.description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", page.title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", page.description);

    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;
  }, [pathname]);

  return null;
}
