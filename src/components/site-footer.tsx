import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t px-5 py-10 md:px-8">
      <div className="text-muted-foreground mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-sm md:flex-row">
        <Link href="/" className="hover:text-foreground inline-flex min-h-11 items-center">
          <BrandMark className="text-foreground text-base" />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/terms" className="hover:text-foreground inline-flex min-h-11 items-center">
            תנאי שימוש
          </Link>
          <Link href="/privacy" className="hover:text-foreground inline-flex min-h-11 items-center">
            מדיניות פרטיות
          </Link>
        </div>
      </div>
    </footer>
  );
}
