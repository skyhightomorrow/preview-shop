import { load } from "cheerio";

export type GarmentCandidate = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

export type ScrapeResult = {
  title: string;
  candidates: GarmentCandidate[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 상품 상세 페이지를 fetch + cheerio로 파싱해 의상 후보 이미지를 수집한다. */
export async function scrapeGarments(targetUrl: string): Promise<ScrapeResult> {
  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      Referer: new URL(targetUrl).origin,
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const base = new URL(targetUrl);

  const seen = new Set<string>();
  const candidates: GarmentCandidate[] = [];

  const push = (rawUrl: string, alt: string, w = 0, h = 0) => {
    if (!rawUrl) return;
    let url: string;
    try {
      url = new URL(rawUrl, base.origin).href;
    } catch {
      return;
    }
    if (!/^https?:/i.test(url)) return;
    if (/\.svg(\?|$)/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, alt: alt || "", width: w, height: h });
  };

  // 1) og:image — 대표 이미지로 가장 신뢰도 높음
  const og = $('meta[property="og:image"]').attr("content");
  if (og) push(og, "대표 이미지", 1000, 1000);

  // 2) JSON-LD 스키마의 이미지
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      const imgs: string[] = [];
      if (data.image) imgs.push(...(Array.isArray(data.image) ? data.image : [data.image]));
      if (data.offers?.image) imgs.push(data.offers.image);
      imgs.forEach((src) => push(src, "schema.org", 800, 800));
    } catch { /* skip */ }
  });

  // 3) img 태그 — data-src, srcset 포함
  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-original") ||
      $(el).attr("data-lazy-src") ||
      ($(el).attr("srcset") || "").split(",").pop()?.trim().split(" ")[0] ||
      "";
    if (!src) return;
    const alt = $(el).attr("alt") || "";
    // 너무 작은 이미지는 스킵 (width/height 속성 기준)
    const w = parseInt($(el).attr("width") || "0");
    const h = parseInt($(el).attr("height") || "0");
    if ((w > 0 && w < 100) || (h > 0 && h < 100)) return;
    push(src, alt, w, h);
  });

  const title = $("title").text().trim() || $('meta[property="og:title"]').attr("content") || "";

  // 작은 이미지 필터 후 상위 12개
  const filtered = candidates
    .filter((c) => (c.width === 0 && c.height === 0) || (c.width >= 200 && c.height >= 200))
    .slice(0, 12);

  return { title, candidates: filtered };
}
