"use client";

import { useEffect, useRef, useState } from "react";

type Candidate = { url: string; alt: string; width: number; height: number };
type Phase = "idle" | "scraping" | "matching" | "clarify" | "manual-img" | "generating" | "result" | "error";

type HistoryItem = {
  id: string;
  timestamp: number;
  resultUrl: string;
  videoUrl?: string;
};

const HISTORY_KEY = "tryon-history";
const MAX_HISTORY = 12;

export default function Home() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [clarifyQuestion, setClarifyQuestion] = useState("");
  const [shortlist, setShortlist] = useState<number[]>([]);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [videoPhase, setVideoPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [manualImgUrl, setManualImgUrl] = useState("");
  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [isDraggingGarment, setIsDraggingGarment] = useState(false);

  const [lightbox, setLightbox] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState("");

  const toolRef = useRef<HTMLDivElement>(null);
  const currentIdRef = useRef<string | null>(null);

  // localStorage 히스토리 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function saveHistory(items: HistoryItem[]) {
    setHistory(items);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }

  // 이미지 결과가 나오면 히스토리에 추가
  useEffect(() => {
    if (phase !== "result" || !resultUrl) return;
    const id = Date.now().toString();
    currentIdRef.current = id;
    const item: HistoryItem = { id, timestamp: Date.now(), resultUrl };
    setHistory((prev) => {
      const updated = [item, ...prev].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, [phase, resultUrl]);

  // 영상이 완료되면 히스토리 최신 항목에 videoUrl 추가
  useEffect(() => {
    if (videoPhase !== "done" || !videoUrl || !currentIdRef.current) return;
    const cid = currentIdRef.current;
    setHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === cid ? { ...item, videoUrl } : item
      );
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, [videoPhase, videoUrl]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function downloadFile(fileUrl: string, filename: string) {
    try {
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(fileUrl, "_blank");
    }
  }

  async function shareUrl(fileUrl: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title: "AI 가상 피팅", text: "AI로 가상으로 옷을 입어봤어요!", url: fileUrl });
        return;
      } catch { /* fallback */ }
    }
    try {
      await navigator.clipboard.writeText(fileUrl);
      showToast("링크가 복사됐어요!");
    } catch {
      showToast("공유 링크: " + fileUrl);
    }
  }

  // ─── 드래그앤드롭 ───────────────────────────────────────────
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function onDragEnter(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  function pickGarmentFile(file: File) {
    setGarmentFile(file);
    setGarmentPreview(URL.createObjectURL(file));
  }
  function onGarmentDragOver(e: React.DragEvent) { e.preventDefault(); setIsDraggingGarment(true); }
  function onGarmentDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingGarment(false);
  }
  function onGarmentDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDraggingGarment(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) pickGarmentFile(f);
  }

  function reset() {
    setPhase("idle"); setError(""); setMessage("");
    setCandidates([]); setShortlist([]); setClarifyQuestion("");
    setResultUrl(null);
    setVideoPhase("idle"); setVideoUrl(null); setVideoProgress(0);
    setManualImgUrl("");
    setGarmentFile(null); setGarmentPreview(null);
    currentIdRef.current = null;
  }

  async function generateWithFile(file: File) {
    setPhase("generating");
    setMessage("의상 이미지 업로드 중…");
    setError("");
    try {
      const uploaded = await fetch("/api/upload-garment", {
        method: "POST",
        body: (() => { const fd = new FormData(); fd.append("file", file); return fd; })(),
      });
      const { url } = await uploaded.json();
      if (!uploaded.ok || !url) throw new Error("이미지 업로드 실패");
      await generateWith(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 오류");
      setPhase("error");
    }
  }

  async function generateWith(garmentUrl: string) {
    setPhase("generating");
    setMessage("내가 그 옷을 입은 모습을 그리는 중…");
    setError("");
    try {
      const fd = new FormData();
      fd.append("photo", photo!);
      fd.append("garmentUrl", garmentUrl);
      fd.append("extraPrompt", prompt);
      const res = await fetch("/api/tryon", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "합성 실패");
      setResultUrl(data.resultUrl);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
      setPhase("error");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!url && !garmentFile) || !photo) return;
    reset();
    try {
      // 의상 이미지가 직접 업로드된 경우 → 스크래핑 건너뜀
      if (garmentFile) {
        await generateWithFile(garmentFile);
        return;
      }

      setPhase("scraping");
      setMessage("상품 페이지에서 옷을 찾는 중…");
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const scrapeData = await scrapeRes.json();
      if (!scrapeRes.ok) throw new Error(scrapeData.error || "페이지를 열지 못했어요.");
      const cands: Candidate[] = scrapeData.candidates;
      setCandidates(cands);

      // 이미지를 아예 못 가져온 경우 (무신사 같은 CSR SPA)
      if (cands.length === 0) {
        setClarifyQuestion("이 페이지에서 이미지를 가져오지 못했어요. 무신사·지그재그 같은 앱 기반 쇼핑몰은 이미지를 직접 붙여넣어야 해요.");
        setShortlist([]);
        setPhase("manual-img");
        return;
      }

      setPhase("matching");
      setMessage(`"${prompt || "옷"}"에 맞는 의상을 고르는 중…`);
      const matchRes = await fetch("/api/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: cands, prompt, url }),
      });
      const match = await matchRes.json();
      if (!matchRes.ok) throw new Error(match.error || "매칭에 실패했어요.");

      if (match.matchedIndex !== null && cands[match.matchedIndex]) {
        await generateWith(cands[match.matchedIndex].url);
      } else {
        const list: number[] = Array.isArray(match.shortlist) && match.shortlist.length > 0
          ? match.shortlist : cands.map((_, i) => i);
        setShortlist(list.filter((i) => cands[i]));
        setClarifyQuestion(match.question || "어떤 옷을 입어볼까요? 골라주세요.");
        setPhase("clarify");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했어요.");
      setPhase("error");
    }
  }

  async function makeVideo() {
    if (!resultUrl) return;
    setVideoPhase("working");
    setVideoProgress(0.05);
    try {
      const startRes = await fetch("/api/video/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: resultUrl }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "영상 시작 실패");
      const id: string = startData.requestId;

      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await fetch(`/api/video/status?id=${encodeURIComponent(id)}`);
        const data = await st.json();
        if (data.state === "completed") {
          setVideoUrl(data.videoUrl);
          setVideoProgress(1);
          setVideoPhase("done");
          return;
        }
        if (data.state === "failed") throw new Error(data.error || "영상 생성 실패");
        setVideoProgress((p) => Math.min(0.95, Math.max(p, data.progress ?? p)));
      }
      throw new Error("영상 생성이 너무 오래 걸려요. 다시 시도해주세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "영상 생성 오류");
      setVideoPhase("error");
    }
  }

  const busy = phase === "scraping" || phase === "matching" || phase === "generating";

  // ─── 공유/다운로드 버튼 컴포넌트 ─────────────────────────────
  function ActionButtons({ fileUrl, type }: { fileUrl: string; type: "image" | "video" }) {
    const ext = type === "video" ? "mp4" : "png";
    return (
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => shareUrl(fileUrl)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          공유하기
        </button>
        <button
          onClick={() => downloadFile(fileUrl, `tryon-${type}-${Date.now()}.${ext}`)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          다운로드
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* 라이트박스 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightbox(null)}
          tabIndex={0}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-4xl leading-none"
            onClick={() => setLightbox(null)}
          >×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="크게 보기"
            className="max-h-[95vh] max-w-[95vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* ===== Hero ===== */}
      <header className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float-slow" />


        <div className="mx-auto max-w-5xl px-6 py-20 text-center relative">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1 text-sm font-medium backdrop-blur">
            AI 가상 피팅 프로토타입
          </span>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
            이 옷, 내가 입으면<br />어떤 느낌일까?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/90">
            쇼핑몰 상품 링크와 내 사진만 올리면, AI가 입어본 모습을 만들어 줘요.
            마음에 들면 <b>한 바퀴 도는 영상</b>으로도.
          </p>
          <button
            onClick={() => toolRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="mt-10 rounded-full bg-white px-8 py-3 font-bold text-violet-700 shadow-lg transition hover:scale-105"
          >
            지금 입어보기 ↓
          </button>
        </div>
      </header>

      {/* ===== 사용법 3단계 ===== */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { n: "1", t: "상품 링크 붙여넣기", d: "입어보고 싶은 옷의 상세 페이지 주소" },
            { n: "2", t: "내 사진 올리기", d: "드래그하거나 클릭해서 올려주세요" },
            { n: "3", t: "AI가 합성 & 영상", d: "입은 모습 이미지 → 도는 영상까지" },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">{s.n}</div>
              <h3 className="mt-4 font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-stone-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 툴 ===== */}
      <section ref={toolRef} className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
          <form onSubmit={onSubmit} className="space-y-6">

            {/* ── STEP 1 : 의상 선택 ── */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 text-sm mt-0.5">1</div>
              <div className="flex-1 space-y-3">
                <p className="font-bold text-stone-800">의상 선택</p>

                {/* 상품 링크 */}
                <div>
                  <label className="text-xs font-medium text-stone-500">상품 상세 페이지 링크</label>
                  <input
                    type="url" value={url}
                    onChange={(e) => { setUrl(e.target.value); if (e.target.value) { setGarmentFile(null); setGarmentPreview(null); } }}
                    placeholder="https://… 쇼핑몰 옷 상세 페이지 주소"
                    disabled={!!garmentFile}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-stone-50 disabled:text-stone-400"
                  />
                  {!garmentFile && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-stone-400">
                      <li>· 상품 <b>상세 페이지</b> 링크를 넣어주세요 (목록·검색 페이지 X)</li>
                      <li>· 무신사·29CM·에이블리·지그재그 등 주요 쇼핑몰 지원</li>
                      <li>· 로그인 필요 페이지·성인 인증 페이지는 가져올 수 없어요</li>
                    </ul>
                  )}
                </div>

                {/* 어떤 옷? (링크 모드일 때만) */}
                {!garmentFile && (
                  <div>
                    <label className="text-xs font-medium text-stone-500">
                      어떤 옷? <span className="font-normal text-stone-400">(여러 옷이 있을 때 / 선택)</span>
                    </label>
                    <input
                      type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                      placeholder='예: "파란색 치마", "체크 셔츠"'
                      className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                )}

                {/* 구분선 */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-stone-200" />
                  <span className="text-xs text-stone-400">또는</span>
                  <div className="h-px flex-1 bg-stone-200" />
                </div>

                {/* 의상 이미지 직접 업로드 */}
                <div>
                  <label className="text-xs font-medium text-stone-500">
                    이미지 직접 올리기 <span className="text-violet-500 font-semibold">(스크린샷 가능)</span>
                  </label>
                  <label
                    className={`mt-1 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition
                      ${isDraggingGarment ? "border-violet-500 bg-violet-50" : garmentFile ? "border-violet-400 bg-violet-50" : "border-stone-300 hover:border-violet-400 hover:bg-stone-50"}`}
                    onDragOver={onGarmentDragOver} onDragLeave={onGarmentDragLeave} onDrop={onGarmentDrop}
                  >
                    {garmentPreview ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={garmentPreview} alt="의상 미리보기" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-violet-700 truncate">{garmentFile!.name}</p>
                          <p className="text-xs text-stone-400 mt-0.5">다른 이미지로 교체하려면 클릭</p>
                        </div>
                        <button type="button"
                          onClick={(e) => { e.preventDefault(); setGarmentFile(null); setGarmentPreview(null); }}
                          className="ml-auto text-stone-400 hover:text-rose-500 text-xl leading-none flex-shrink-0">×</button>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl">📸</span>
                        <div>
                          <p className="text-sm font-medium text-stone-600">
                            {isDraggingGarment ? "여기에 놓아주세요" : "클릭하거나 드래그"}
                          </p>
                          <p className="text-xs text-stone-400 mt-0.5">모바일 스크린샷 · 상품 이미지 파일</p>
                        </div>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { pickGarmentFile(f); setUrl(""); } }} />
                  </label>
                </div>
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-stone-100" />

            {/* ── STEP 2 : 내 사진 ── */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 text-sm mt-0.5">2</div>
              <div className="flex-1">
                <p className="font-bold text-stone-800 mb-3">내 사진</p>
                <div className="flex items-center gap-4">
                  <label
                    className={`flex-1 cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition
                      ${isDragging ? "border-violet-500 bg-violet-50 text-violet-600" : "border-stone-300 text-stone-500 hover:border-violet-400 hover:bg-violet-50"}`}
                    onDragOver={onDragOver} onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave} onDrop={onDrop}
                  >
                    {isDragging ? "여기에 놓아주세요" : photo ? `📷 ${photo.name}` : "클릭하거나 사진을 여기로 드래그"}
                    <input type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
                  </label>
                  {photoPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="미리보기" className="h-24 w-24 rounded-xl object-cover" />
                  )}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-stone-400">
                  <li>· 얼굴이 <b>정면으로 크게</b> 나올수록 본인과 더 닮게 나와요</li>
                  <li>· 전신이 나오면 키·체형 보정이 더 자연스럽습니다</li>
                  <li>· 모자·선글래스·헤드폰·마스크는 <b>그대로 유지</b>됩니다</li>
                  <li>· 고해상도 사진일수록 결과 품질이 좋아집니다</li>
                </ul>
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-stone-100" />

            {/* ── STEP 3 : 생성 버튼 ── */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 text-sm mt-0.5">3</div>
              <div className="flex-1">
                <p className="font-bold text-stone-800 mb-3">AI 합성 시작</p>
                <button
                  type="submit" disabled={(!url && !garmentFile) || !photo || busy}
                  className="w-full rounded-xl bg-violet-600 py-3.5 font-bold text-white shadow-lg transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {busy ? "처리 중…" : "입어보기 생성 ✨"}
                </button>

                {/* 내 기록 */}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-stone-200 py-3.5 font-bold text-stone-600 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    내 생성 기록 보기 ({history.length}개)
                  </button>
                )}
              </div>
            </div>

          </form>

          {busy && (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-violet-700">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
              <button onClick={reset} className="ml-2 underline">다시 시도</button>
            </div>
          )}

          {(phase === "clarify" || phase === "manual-img") && (
            <div className="mt-6">
              <p className="font-semibold text-stone-800">🤔 {clarifyQuestion}</p>

              {/* 후보 이미지 그리드 */}
              {shortlist.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {shortlist.map((i) => (
                    <button key={i} onClick={() => generateWith(candidates[i].url)}
                      className="group overflow-hidden rounded-xl border border-stone-200 transition hover:border-violet-500 hover:shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={candidates[i].url} alt={candidates[i].alt || `후보 ${i}`} className="aspect-square w-full object-cover" />
                      <span className="block bg-white py-2 text-xs text-stone-500 group-hover:text-violet-600">이 옷으로 입어보기</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 직접 입력 / 파일 업로드 */}
              <div className={`${shortlist.length > 0 ? "mt-5 border-t border-stone-100 pt-5" : "mt-4"}`}>
                <p className="text-sm font-medium text-stone-600 mb-3">
                  {shortlist.length > 0 ? "원하는 옷이 없다면 — 의상 이미지 직접 추가" : "의상 이미지를 직접 추가해주세요"}
                </p>

                {/* 옵션 A: 스크린샷 업로드 */}
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50 px-4 py-3.5 transition hover:border-violet-400 hover:bg-violet-100 mb-3">
                  <span className="text-2xl">📸</span>
                  <div>
                    <p className="text-sm font-semibold text-violet-700">스크린샷 또는 이미지 파일 업로드</p>
                    <p className="text-xs text-violet-500 mt-0.5">모바일에서 상품 화면 캡처 후 바로 올리기</p>
                  </div>
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) generateWithFile(f); }}
                  />
                </label>

                {/* 옵션 B: URL 붙여넣기 */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-stone-200" />
                  <span className="text-xs text-stone-400">또는 URL로</span>
                  <div className="h-px flex-1 bg-stone-200" />
                </div>
                <p className="text-xs text-stone-400 mb-2">
                  PC에서: 상품 이미지 위 <b>오른쪽 클릭 → 이미지 주소 복사</b>
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualImgUrl}
                    onChange={(e) => setManualImgUrl(e.target.value)}
                    placeholder="https://… 의상 이미지 URL"
                    className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    onKeyDown={(e) => e.key === "Enter" && manualImgUrl && generateWith(manualImgUrl)}
                  />
                  <button
                    onClick={() => manualImgUrl && generateWith(manualImgUrl)}
                    disabled={!manualImgUrl}
                    className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:bg-stone-300"
                  >
                    생성
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 결과 ===== */}
          {phase === "result" && resultUrl && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-stone-800">✨ 입어본 모습</h3>
              <div
                className="mt-3 overflow-hidden rounded-2xl border border-stone-200 cursor-zoom-in relative group"
                onClick={() => setLightbox(resultUrl)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultUrl} alt="가상 피팅 결과" className="w-full" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-sm font-medium px-3 py-1.5 rounded-full">
                    크게 보기
                  </span>
                </div>
              </div>
              <ActionButtons fileUrl={resultUrl} type="image" />

              {/* 영상 */}
              {videoPhase === "idle" && (
                <button onClick={makeVideo}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-rose-500 py-3.5 font-bold text-white shadow-lg transition hover:opacity-90">
                  🎬 한 바퀴 도는 영상으로 만들기
                </button>
              )}
              {videoPhase === "working" && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 rounded-xl bg-fuchsia-50 px-4 py-3 text-fuchsia-700">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300 border-t-fuchsia-600" />
                    <span className="text-sm font-medium">영상 만드는 중… (1~3분 소요) {Math.round(videoProgress * 100)}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(videoProgress * 100)}%` }} />
                  </div>
                </div>
              )}
              {videoPhase === "done" && videoUrl && (
                <div className="mt-4">
                  <div className="overflow-hidden rounded-2xl border border-stone-200">
                    <video src={videoUrl} controls autoPlay loop className="w-full" />
                  </div>
                  <ActionButtons fileUrl={videoUrl} type="video" />
                </div>
              )}
              {videoPhase === "error" && (
                <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                  <button onClick={() => setVideoPhase("idle")} className="ml-2 underline">다시 시도</button>
                </div>
              )}

              <button onClick={reset} className="mt-4 w-full rounded-xl border border-stone-300 py-3 font-medium text-stone-600 hover:bg-stone-50">
                다른 옷 입어보기
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">
          ⚡ 프로토타입 · 결과 이미지는 AI 생성물이며 실제 착용과 다를 수 있어요.
        </p>
      </section>

      {/* ===== 기록 모달 ===== */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between bg-white px-6 py-5 border-b border-stone-100">
              <h2 className="text-lg font-bold text-stone-900">내 생성 기록</h2>
              <div className="flex items-center gap-3">
                {history.length > 0 && (
                  <button
                    onClick={() => { saveHistory([]); setShowHistory(false); }}
                    className="text-xs text-stone-400 hover:text-rose-500 transition"
                  >
                    전체 삭제
                  </button>
                )}
                <button onClick={() => setShowHistory(false)} className="text-stone-400 hover:text-stone-700 text-2xl leading-none">×</button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="py-16 text-center text-stone-400">아직 생성된 기록이 없어요.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-stone-200 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.resultUrl} alt="생성 결과"
                      className="w-full aspect-[9/16] object-cover object-top cursor-pointer"
                      onClick={() => window.open(item.resultUrl, "_blank")}
                    />
                    <div className="p-3">
                      <p className="text-xs text-stone-400 mb-2">
                        {new Date(item.timestamp).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => shareUrl(item.resultUrl)}
                          className="flex-1 rounded-lg border border-stone-200 py-1.5 text-xs text-stone-500 hover:bg-stone-50 transition"
                        >공유</button>
                        <button
                          onClick={() => downloadFile(item.resultUrl, `tryon-${item.id}.png`)}
                          className="flex-1 rounded-lg border border-stone-200 py-1.5 text-xs text-stone-500 hover:bg-stone-50 transition"
                        >저장</button>
                        {item.videoUrl && (
                          <button
                            onClick={() => downloadFile(item.videoUrl!, `tryon-video-${item.id}.mp4`)}
                            className="flex-1 rounded-lg bg-fuchsia-50 border border-fuchsia-200 py-1.5 text-xs text-fuchsia-600 hover:bg-fuchsia-100 transition"
                          >영상</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
