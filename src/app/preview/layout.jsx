import { Inter } from "next/font/google";
import "./preview.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = { title: "Preview — Painel Fix" };

export default function PreviewLayout({ children }) {
  return (
    <div className={`${inter.variable} preview-root min-h-screen bg-[var(--p-bg)] font-[var(--font-inter),_ui-sans-serif,_system-ui]`}>
      {children}
    </div>
  );
}
