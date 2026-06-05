import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "입어보기 — AI 가상 피팅",
  description:
    "쇼핑몰 옷, 사면 어울릴까? 상품 링크와 내 전신샷만 올리면 내가 그 옷을 입은 모습을 AI가 보여줍니다. 영상으로도 만들어보세요.",
  openGraph: {
    title: "입어보기 — AI 가상 피팅",
    description: "쇼핑몰 옷을 내가 입으면 어떤 느낌일까? AI로 미리 입어보세요.",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSansKR.variable}>
      <body className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
