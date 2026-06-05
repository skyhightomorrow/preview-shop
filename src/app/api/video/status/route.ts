import { NextResponse } from "next/server";
import { getVideoStatus } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "작업 ID가 없어요." }, { status: 400 });
    }
    const status = await getVideoStatus(id);
    return NextResponse.json(status);
  } catch (e) {
    console.error("video status error", e);
    return NextResponse.json({ error: "영상 상태 조회에 실패했어요." }, { status: 500 });
  }
}
