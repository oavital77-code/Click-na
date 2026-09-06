import type { Metadata } from "next";
import { Heebo, Inter, Frank_Ruhl_Libre, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, heIL } from "@clerk/localizations";
import { DirectionProvider } from "@radix-ui/react-direction";
import { appUrl } from "@/lib/public-url";
import { getCurrentLocale } from "@/lib/auth";
import { dirFor, langTag } from "@/i18n/config";
import "./globals.css";

// Heebo carries body text in both scripts (it ships Latin as well as Hebrew);
// Inter is reserved for numerals/tabular data; Frank Ruhl Libre — an editorial
// display serif — is the boutique headline voice applied to every h1/h2/h3
// (see globals.css).
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

const description = "Scheduling and booking for therapists and independent practitioners";

export const metadata: Metadata = {
  // Absolute URLs for the share cards. Without metadataBase, Next emits a
  // relative og:image and WhatsApp shows no preview at all.
  metadataBase: new URL(appUrl()),
  title: { default: "Cleana+", template: "%s · Cleana+" },
  description,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Cleana+",
    title: "Cleana+",
    description,
  },
  twitter: { card: "summary_large_image", title: "Cleana+", description },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The signed-in therapist's language decides <html lang dir> and Clerk's own
  // strings. A visitor who is not signed in gets the product default. Public
  // booking pages speak the *therapist's* language regardless of who is
  // looking, and correct these attributes themselves (see HtmlLangDir).
  const locale = await getCurrentLocale();
  const dir = dirFor(locale);

  return (
    <ClerkProvider localization={locale === "he" ? heIL : enUS}>
      <html
        lang={langTag(locale)}
        dir={dir}
        className={`${heebo.variable} ${inter.variable} ${frankRuhlLibre.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <DirectionProvider dir={dir}>{children}</DirectionProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
