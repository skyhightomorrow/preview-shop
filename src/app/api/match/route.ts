import { NextResponse } from "next/server";
import { matchGarment } from "@/lib/match";
import type { GarmentCandidate } from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { candidates, prompt, url } = (await req.json()) as {
      candidates?: GarmentCandidate[];
      prompt?: string;
      url?: string;
    };
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: "후보 이미지가 없습니다." }, { status: 400 });
    }
    const result = await matchGarment(candidates, prompt || "", url || "");
    return NextResponse.json(result);
  } catch (e) {
    console.error("match error", e);
    return NextResponse.json({ error: "의상 매칭 중 오류가 발생했어요." }, { status: 500 });
  }
}
