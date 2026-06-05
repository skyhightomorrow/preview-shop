import { NextResponse } from "next/server";
import { startTryOnVideo } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { imageUrl } = (await req.json()) as { imageUrl?: string };
    if (!imageUrl) {
      return NextResponse.json({ error: "영상으로 만들 이미지가 없어요." }, { status: 400 });
    }
    const requestId = await startTryOnVideo(imageUrl);
    return NextResponse.json({ requestId });
  } catch (e) {
    console.error("video start error", e);
    return NextResponse.json({ error: "영상 생성을 시작하지 못했어요." }, { status: 500 });
  }
}
