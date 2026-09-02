import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t px-4 py-10">
      <div className="text-muted-foreground mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-sm sm:flex-row">
        <Link href="/" className="hover:text-foreground">
          <BrandMark className="text-foreground text-base" />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/terms" className="hover:text-foreground">
            תנאי שימוש
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            מדיניות פרטיות
          </Link>
        </div>
      </div>
    </footer>
  );
}
