import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "이사 플래너",
  description: "함께 준비하는 이사 D-day 체크리스트",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" suppressHydrationWarning><body>{children}</body></html>;
}
