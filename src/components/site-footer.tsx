import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t px-4 py-6">
      <div className="text-muted-foreground mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-4 text-sm">
        <Link href="/" className="hover:text-foreground">
          Cleana+
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          תנאי שימוש
        </Link>
        <Link href="/privacy" className="hover:text-foreground">
          מדיניות פרטיות
        </Link>
        <Link href="/cookies" className="hover:text-foreground">
          עוגיות
        </Link>
      </div>
    </footer>
  );
}
