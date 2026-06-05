import Anthropic from "@anthropic-ai/sdk";
import type { GarmentCandidate } from "./scrape";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type MatchResult = {
  // 자신 있게 하나로 특정된 경우의 인덱스 (없으면 null)
  matchedIndex: number | null;
  // 애매해서 사용자에게 물어봐야 하는 경우
  needsClarification: boolean;
  question: string;
  // 사용자에게 보여줄 후보 인덱스들 (애매할 때)
  shortlist: number[];
};

type ImageBlock = {
  type: "image";
  source:
    | { type: "url"; url: string }
    | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 핫링크 차단을 피하려 서버에서 직접 이미지를 받아 base64로 변환. 실패 시 URL 소스로 폴백. */
async function toImageBlock(url: string, referer: string): Promise<ImageBlock> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "image/*" },
    });
    const ct = res.headers.get("content-type") || "";
    const media =
      ct.includes("png") ? "image/png" : ct.includes("webp") ? "image/webp" : "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    // 5MB 초과하면 URL 소스로 (Claude가 직접 받도록)
    if (res.ok && buf.length > 0 && buf.length < 5_000_000) {
      return { type: "image", source: { type: "base64", media_type: media as never, data: buf.toString("base64") } };
    }
  } catch {
    /* fall through */
  }
  return { type: "image", source: { type: "url", url } };
}

/**
 * 후보 이미지들 중 사용자 프롬프트("파란색 치마")에 맞는 의상을 고른다.
 * 명확하면 matchedIndex, 애매하면 needsClarification + shortlist.
 */
export async function matchGarment(
  candidates: GarmentCandidate[],
  userPrompt: string,
  pageUrl: string,
): Promise<MatchResult> {
  const top = candidates.slice(0, 8);
  const referer = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return pageUrl;
    }
  })();

  const blocks: Anthropic.Messages.ContentBlockParam[] = [];
  for (let i = 0; i < top.length; i++) {
    blocks.push({ type: "text", text: `[이미지 ${i}] alt="${top[i].alt}"` });
    blocks.push((await toImageBlock(top[i].url, referer)) as Anthropic.Messages.ImageBlockParam);
  }
  blocks.push({
    type: "text",
    text: `위는 한 쇼핑몰 상품 페이지에서 수집한 이미지들이다.
사용자가 입어보고 싶어하는 의상: "${userPrompt || "(설명 없음)"}"

이 중에서 '하나의 입을 수 있는 의상'을 정확히 골라라. 로고/배너/모델 전신 코디샷/상세 설명 이미지가 섞여 있을 수 있다.
- 사용자 설명과 명확히 일치하는 의상 이미지가 단 하나면: matchedIndex 에 그 번호.
- 설명이 없거나, 후보가 여러 개라 특정이 어려우면: needsClarification=true, question 에 한국어로 짧고 구체적인 질문, shortlist 에 후보 이미지 번호들(최대 4개).
반드시 아래 JSON 형식만 출력:
{"matchedIndex": number|null, "needsClarification": boolean, "question": string, "shortlist": number[]}`,
  });

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: blocks }],
  });

  const text = msg.content.find((c) => c.type === "text")?.type === "text"
    ? (msg.content.find((c) => c.type === "text") as Anthropic.TextBlock).text
    : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return { matchedIndex: null, needsClarification: true, question: "어떤 옷을 입어볼까요? 후보 중에서 골라주세요.", shortlist: top.map((_, i) => i) };
  }
  try {
    const parsed = JSON.parse(json) as MatchResult;
    return {
      matchedIndex: typeof parsed.matchedIndex === "number" ? parsed.matchedIndex : null,
      needsClarification: !!parsed.needsClarification,
      question: parsed.question || "어떤 옷을 입어볼까요?",
      shortlist: Array.isArray(parsed.shortlist) ? parsed.shortlist : [],
    };
  } catch {
    return { matchedIndex: null, needsClarification: true, question: "어떤 옷을 입어볼까요? 후보 중에서 골라주세요.", shortlist: top.map((_, i) => i) };
  }
}
