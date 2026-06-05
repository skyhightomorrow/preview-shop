import { NextResponse } from "next/server";
import { uploadToFal } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "파일이 없어요." }, { status: 400 });
    }
    const url = await uploadToFal(file);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("upload-garment error", e);
    return NextResponse.json({ error: "업로드에 실패했어요." }, { status: 500 });
  }
}
