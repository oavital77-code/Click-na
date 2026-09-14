import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";

/** Same guard as /login, for the same reason — see the note there. */
export default async function SignupPage({ params }: PageProps<"/signup/[[...rest]]">) {
  const { rest } = await params;
  if (!rest?.length) {
    const { userId } = await auth();
    if (userId) redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 md:p-8">
      <SignUp
        routing="path"
        path="/signup"
        signInUrl="/login"
        fallbackRedirectUrl="/dashboard"
      />
    </main>
  );
}
