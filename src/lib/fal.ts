import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_API_KEY });

const MODEL_TRYON = "fal-ai/flux-2-pro/edit";
const MODEL_VIDEO = "fal-ai/wan-25-preview/image-to-video";

function firstImageUrl(result: unknown): string {
  const url =
    (result as { data?: { images?: { url: string }[] } }).data?.images?.[0]?.url ||
    (result as { images?: { url: string }[] }).images?.[0]?.url;
  if (!url) throw new Error("fal: 생성된 이미지 URL이 없습니다");
  return url;
}

function buildTryOnPrompt(extraPrompt?: string): string {
  return [
    "You are given two reference images.",
    "The FIRST image is the real person (the user). The SECOND image is a garment/clothing reference only.",
    "Create one new photorealistic FULL-BODY fashion photo of the FIRST person wearing the clothing item from the SECOND image.",
    "CRITICAL — PRESERVE EVERYTHING FROM FIRST IMAGE EXCEPT THE CLOTHING: keep the person's EXACT face and facial features; their EXACT hairstyle and hair color; any hat or cap — keep exactly as-is; any glasses or sunglasses — keep exactly as worn; any headphones or earphones — keep exactly as worn; any face mask — keep exactly as worn; any other accessories on the head, face or neck.",
    "ONLY change: dress them in the garment from the SECOND image, fitted naturally; adjust body proportions to be taller and more model-like — body only, never the face or accessories.",
    "Remove anything they are holding (food, drinks, etc.).",
    "Clean white studio background, soft even lighting, standing front-facing pose, vertical full-body framing, high detail, no text, no watermark.",
    extraPrompt ? `Additional context: ${extraPrompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 업로드된 인물 사진(Blob)을 fal 스토리지에 올리고 공개 URL을 반환. */
export async function uploadToFal(file: File | Blob): Promise<string> {
  return await fal.storage.upload(file);
}

/**
 * 착용 합성. image_urls = [인물샷, 의상 이미지].
 * 얼굴·헤어스타일·모자·안경(선글래스) 유지, 옷만 바꿈.
 */
export async function generateTryOn(
  personUrl: string,
  garmentUrl: string,
  extraPrompt?: string,
): Promise<string> {
  const result = await fal.subscribe(MODEL_TRYON, {
    input: {
      prompt: buildTryOnPrompt(extraPrompt),
      image_urls: [personUrl, garmentUrl],
      num_images: 1,
    },
  } as never);
  return firstImageUrl(result);
}

/** 영상 생성 작업을 Wan 2.5 큐에 제출하고 request_id를 반환. */
export async function startTryOnVideo(imageUrl: string): Promise<string> {
  const prompt =
    "The person slowly turns around 360 degrees in place to show the full outfit from all sides. " +
    "Smooth, natural full-body rotation in fashion lookbook style. " +
    "Same white studio background, soft even lighting, stable camera, no cuts.";
  const { request_id } = await fal.queue.submit(MODEL_VIDEO, {
    input: {
      prompt,
      image_url: imageUrl,
      duration: 5,
      resolution: "720p",
    },
  } as never);
  return request_id;
}

export type VideoStatus =
  | { state: "pending"; progress: number }
  | { state: "completed"; videoUrl: string }
  | { state: "failed"; error: string };

/** Wan 2.5 큐 작업 상태를 조회. 완료되면 영상 URL과 함께 반환. */
export async function getVideoStatus(requestId: string): Promise<VideoStatus> {
  const status = await fal.queue.status(MODEL_VIDEO, {
    requestId,
    logs: false,
  });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result(MODEL_VIDEO, { requestId });
    const videoUrl =
      (result as { data?: { video?: { url: string } } }).data?.video?.url ||
      (result as { video?: { url: string } }).video?.url;
    if (!videoUrl) return { state: "failed", error: "영상 URL을 찾지 못했습니다" };
    return { state: "completed", videoUrl };
  }

  const queuePos = (status as { queue_position?: number }).queue_position ?? 0;
  const progress = status.status === "IN_PROGRESS" ? 0.6 : Math.max(0.1, 0.4 - queuePos * 0.05);
  return { state: "pending", progress };
}
