import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { DirectionProvider } from "@radix-ui/react-direction";
import { appUrl } from "@/lib/public-url";
import { getCurrentLocale } from "@/lib/auth";
import { DEFAULT_LOCALE, dirFor, langTag } from "@/i18n/config";
import "./globals.css";

// One typeface for everything — body, headings, numbers, the wordmark: Heebo,
// which ships Latin as well as Hebrew. Loaded as the variable font, so every
// weight the pages ask for (300 to 800) is real rather than synthesised.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
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
    locale: DEFAULT_LOCALE === "he" ? "he_IL" : "en_US",
    siteName: "Cleana+",
    title: "Cleana+",
    description,
  },
  twitter: { card: "summary_large_image", title: "Cleana+", description },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The signed-in therapist's language decides <html lang dir>. A visitor who
  // is not signed in — and every public route, which does not run Clerk at all
  // (see src/proxy.ts) — gets the product default. Public booking pages speak
  // the *therapist's* language regardless of who is looking, and correct these
  // attributes themselves (see HtmlLangDir).
  const locale = await getCurrentLocale();
  const dir = dirFor(locale);

  // No ClerkProvider here on purpose: the booking page and the landing page
  // would otherwise ship the auth SDK to every visitor who will never sign in.
  // It wraps the three route groups that actually need it instead — the
  // dashboard, and the sign-in and sign-up screens.
  return (
    <html
      lang={langTag(locale)}
      dir={dir}
      className={`${heebo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </body>
    </html>
  );
}
