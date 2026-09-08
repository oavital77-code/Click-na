import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
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
