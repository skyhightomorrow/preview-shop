import { NextResponse } from "next/server";
import { scrapeGarments } from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "유효한 상품 URL을 입력해주세요." }, { status: 400 });
    }
    const result = await scrapeGarments(url);
    if (result.candidates.length === 0) {
      return NextResponse.json(
        { error: "이 페이지에서 의상 이미지를 찾지 못했어요. 다른 링크를 시도해보세요." },
        { status: 422 },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("scrape error", e);
    return NextResponse.json({ error: "페이지를 여는 데 실패했어요. 링크를 확인해주세요." }, { status: 500 });
  }
}
