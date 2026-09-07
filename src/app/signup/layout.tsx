import { ClerkProvider } from "@clerk/nextjs";
import { enUS } from "@clerk/localizations";

// Clerk is mounted per route group rather than at the root, so the public
// pages ship none of it (see src/app/layout.tsx). Sign-up is reached before
// there is a therapist row to read a language from, so it speaks the default.
export default function SignupLayout({ children }: LayoutProps<"/signup">) {
  return <ClerkProvider localization={enUS}>{children}</ClerkProvider>;
}
