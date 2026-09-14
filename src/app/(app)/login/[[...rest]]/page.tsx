import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";

/**
 * Someone who already has a session has nothing to do on the sign-in screen,
 * and leaving them on it is what made signing in feel broken: the form renders,
 * the email they type starts a second sign-in against a session Clerk already
 * has, and nothing visibly happens. A reload then "worked" only because Clerk
 * resolved the existing session on mount and moved them along.
 *
 * The check is on the exact /login path only. This is an optional catch-all
 * because <SignIn routing="path"> owns sub-paths under it — factor-one,
 * sso-callback and friends — and those are steps *towards* a session, some of
 * which set it as they finish. Redirecting out of them would cut Clerk's own
 * hand-off in half.
 */
export default async function LoginPage({ params }: PageProps<"/login/[[...rest]]">) {
  const { rest } = await params;
  if (!rest?.length) {
    const { userId } = await auth();
    if (userId) redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 md:p-8">
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/signup"
        fallbackRedirectUrl="/dashboard"
      />
    </main>
  );
}
