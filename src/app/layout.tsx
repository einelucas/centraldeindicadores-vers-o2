import type { Metadata } from "next";
import "./globals.css";
import { Manrope, Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
});

/** Fonte de títulos/headings — mesma usada no hub de automação. */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Central de Indicadores",
  description: "Indicadores corporativos consolidados",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={cn("font-sans", montserrat.variable, manrope.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
