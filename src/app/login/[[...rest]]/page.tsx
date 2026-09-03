import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
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
