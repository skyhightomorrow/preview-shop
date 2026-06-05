"use client";

import { useRef, useState } from "react";

type Candidate = { url: string; alt: string; width: number; height: number };
type Phase = "idle" | "scraping" | "matching" | "clarify" | "generating" | "result" | "error";

export default function Home() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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

  const toolRef = useRef<HTMLDivElement>(null);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setPhase("idle");
    setError("");
    setMessage("");
    setCandidates([]);
    setShortlist([]);
    setClarifyQuestion("");
    setResultUrl(null);
    setVideoPhase("idle");
    setVideoUrl(null);
    setVideoProgress(0);
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
    if (!url || !photo) return;
    reset();
    try {
      // 1) 상품 페이지에서 의상 이미지 수집
      setPhase("scraping");
      setMessage("상품 페이지에서 옷을 찾는 중…");
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const scrapeData = await scrapeRes.json();
      if (!scrapeRes.ok) throw new Error(scrapeData.error || "페이지를 열지 못했어요.");
      const cands: Candidate[] = scrapeData.candidates;
      setCandidates(cands);

      // 2) 프롬프트로 의상 매칭
      setPhase("matching");
      setMessage(`"${prompt || "옷"}"에 맞는 의상을 고르는 중…`);
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: cands, prompt, url }),
      });
      const match = await matchRes.json();
      if (!matchRes.ok) throw new Error(match.error || "매칭에 실패했어요.");

      if (match.matchedIndex !== null && cands[match.matchedIndex]) {
        // 3) 바로 합성
        await generateWith(cands[match.matchedIndex].url);
      } else {
        // 애매 → 사용자에게 물어보기
        const list: number[] =
          Array.isArray(match.shortlist) && match.shortlist.length > 0
            ? match.shortlist
            : cands.map((_, i) => i);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: resultUrl }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "영상 시작 실패");
      const id: string = startData.requestId;

      // 폴링
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

  return (
    <div className="min-h-screen">
      {/* ===== Hero / 랜딩 ===== */}
      <header className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-float-slow" />
        <div className="mx-auto max-w-5xl px-6 py-20 text-center relative">
          <span className="inline-block rounded-full bg-white/15 px-4 py-1 text-sm font-medium backdrop-blur">
            AI 가상 피팅 프로토타입
          </span>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
            이 옷, 내가 입으면
            <br />
            어떤 느낌일까?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/90">
            쇼핑몰 상품 링크와 내 전신샷만 올리면, 내가 그 옷을 입은 모습을 AI가 만들어 보여줘요.
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
            { n: "2", t: "내 전신샷 올리기", d: "정면 전신 사진이 가장 잘 나와요" },
            { n: "3", t: "AI가 합성 & 영상", d: "입은 모습 이미지 → 도는 영상까지" },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">
                {s.n}
              </div>
              <h3 className="mt-4 font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-stone-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 툴 ===== */}
      <section ref={toolRef} className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-stone-700">상품 상세 페이지 링크</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… 쇼핑몰 옷 상세 페이지 주소"
                className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                required
              />
              <ul className="mt-2 space-y-0.5 text-xs text-stone-400">
                <li>· 상품 <b>상세 페이지</b> 링크를 넣어주세요 (목록·검색 페이지 X)</li>
                <li>· 무신사·29CM·에이블리·지그재그 등 주요 쇼핑몰 지원</li>
                <li>· 로그인해야 보이는 페이지나 성인 인증 페이지는 가져올 수 없어요</li>
              </ul>
            </div>

            <div>
              <label className="text-sm font-semibold text-stone-700">
                어떤 옷? <span className="font-normal text-stone-400">(여러 옷이 있을 때 / 선택)</span>
              </label>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='예: "파란색 치마", "체크 셔츠"'
                className="mt-1.5 w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-stone-700">내 사진</label>
              <div className="mt-1.5 flex items-center gap-4">
                <label className="flex-1 cursor-pointer rounded-xl border-2 border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 transition hover:border-violet-400 hover:bg-violet-50">
                  {photo ? `📷 ${photo.name}` : "클릭해서 사진 선택"}
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

            <button
              type="submit"
              disabled={!url || !photo || busy}
              className="w-full rounded-xl bg-violet-600 py-3.5 font-bold text-white shadow-lg transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {busy ? "처리 중…" : "입어보기 생성 ✨"}
            </button>
          </form>

          {/* 진행 상태 */}
          {busy && (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 text-violet-700">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-600" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}

          {/* 오류 */}
          {phase === "error" && (
            <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
              <button onClick={reset} className="ml-2 underline">
                다시 시도
              </button>
            </div>
          )}

          {/* 의상 선택 (애매할 때) */}
          {phase === "clarify" && (
            <div className="mt-6">
              <p className="font-semibold text-stone-800">🤔 {clarifyQuestion}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shortlist.map((i) => (
                  <button
                    key={i}
                    onClick={() => generateWith(candidates[i].url)}
                    className="group overflow-hidden rounded-xl border border-stone-200 transition hover:border-violet-500 hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={candidates[i].url}
                      alt={candidates[i].alt || `후보 ${i}`}
                      className="aspect-square w-full object-cover"
                    />
                    <span className="block bg-white py-2 text-xs text-stone-500 group-hover:text-violet-600">
                      이 옷으로 입어보기
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 결과 */}
          {phase === "result" && resultUrl && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-stone-800">✨ 입어본 모습</h3>
              <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultUrl} alt="가상 피팅 결과" className="w-full" />
              </div>

              {/* 영상 영역 */}
              {videoPhase === "idle" && (
                <button
                  onClick={makeVideo}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-rose-500 py-3.5 font-bold text-white shadow-lg transition hover:opacity-90"
                >
                  🎬 한 바퀴 도는 영상으로 만들기
                </button>
              )}

              {videoPhase === "working" && (
                <div className="mt-4">
                  <div className="flex items-center gap-3 rounded-xl bg-fuchsia-50 px-4 py-3 text-fuchsia-700">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300 border-t-fuchsia-600" />
                    <span className="text-sm font-medium">
                      영상 만드는 중… (1~3분 소요) {Math.round(videoProgress * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-fuchsia-500 transition-all"
                      style={{ width: `${Math.round(videoProgress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {videoPhase === "done" && videoUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200">
                  <video src={videoUrl} controls autoPlay loop className="w-full" />
                </div>
              )}

              {videoPhase === "error" && (
                <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                  <button onClick={() => setVideoPhase("idle")} className="ml-2 underline">
                    다시 시도
                  </button>
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
    </div>
  );
}
