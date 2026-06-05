import { NextResponse } from "next/server";
import { generateTryOn, uploadToFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const garmentUrl = form.get("garmentUrl");
    const extraPrompt = (form.get("extraPrompt") as string) || "";

    if (!(photo instanceof Blob)) {
      return NextResponse.json({ error: "전신샷 사진을 올려주세요." }, { status: 400 });
    }
    if (typeof garmentUrl !== "string" || !garmentUrl) {
      return NextResponse.json({ error: "의상 이미지가 지정되지 않았어요." }, { status: 400 });
    }

    const personUrl = await uploadToFal(photo);
    const resultUrl = await generateTryOn(personUrl, garmentUrl, extraPrompt);
    return NextResponse.json({ resultUrl });
  } catch (e) {
    console.error("tryon error", e);
    return NextResponse.json({ error: "이미지 합성에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
