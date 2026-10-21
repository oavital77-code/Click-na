import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/** The CleanaGroup site, which presents both products and links back here. */
const GROUP_URL = "https://cleanagroup.app";

/** How to reach us, shown on every public page. */
const CONTACT_EMAIL = "baclinica5@gmail.com";
const WHATSAPP_URL = "https://wa.me/972522474885";

/**
 * Shared with the Hebrew legal pages, so the language is a prop rather than a
 * second component — the landing page is English, the terms and privacy pages
 * are not.
 */
export function SiteFooter({ english = false }: { english?: boolean } = {}) {
  return (
    <footer dir={english ? "ltr" : undefined} className="border-border/60 border-t px-5 py-10 md:px-8">
      <div className="text-muted-foreground mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-sm md:flex-row">
        <Link href="/" className="hover:text-foreground inline-flex min-h-11 items-center">
          <BrandMark className="text-foreground text-base" />
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-6">
          <Link href="/terms" className="hover:text-foreground inline-flex min-h-11 items-center">
            {english ? "Terms" : "תנאי שימוש"}
          </Link>
          <Link href="/privacy" className="hover:text-foreground inline-flex min-h-11 items-center">
            {english ? "Privacy" : "מדיניות פרטיות"}
          </Link>
          <Link href="/accessibility" className="hover:text-foreground inline-flex min-h-11 items-center">
            {english ? "Accessibility" : "הצהרת נגישות"}
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground inline-flex min-h-11 items-center">
            {english ? "Email us" : "מייל"}
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-foreground inline-flex min-h-11 items-center"
          >
            {english ? "WhatsApp" : "וואטסאפ"}
          </a>
          {/* The group site links to Cleana+; this closes the loop the other way.
              Plain <a>: it is a different origin, so there is nothing to prefetch.
              The Latin name sits inside a dir="ltr" span in the Hebrew footer for
              the same reason BrandMark does — separate inline runs reorder in RTL. */}
          <a
            href={GROUP_URL}
            className="hover:text-foreground inline-flex min-h-11 items-center gap-1"
          >
            {english ? "Part of" : "חלק מ־"}
            <span dir="ltr">CleanaGroup</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
