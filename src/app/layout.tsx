import type { Metadata } from "next";
import { Heebo, Inter, Frank_Ruhl_Libre, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";
import { DirectionProvider } from "@radix-ui/react-direction";
import "./globals.css";

// Heebo carries all Hebrew body text; Inter is reserved for numerals/tabular
// data; Frank Ruhl Libre — an editorial Hebrew display serif — is the
// boutique headline voice applied to every h1/h2/h3 (see globals.css).
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const frankRuhlLibre = Frank_Ruhl_Libre({
  variable: "--font-serif-display",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cleana+",
  description: "מערכת ניהול תורים וזימונים למטפלים ובעלי מקצוע עצמאיים",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider localization={heIL}>
      <html
        lang="he"
        dir="rtl"
        className={`${heebo.variable} ${inter.variable} ${frankRuhlLibre.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <DirectionProvider dir="rtl">{children}</DirectionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
