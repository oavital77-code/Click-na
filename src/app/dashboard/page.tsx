import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentTherapist } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const therapist = await getCurrentTherapist();

  if (!therapist) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">
          מסיימים את ההרשמה שלך... אם זה נמשך, רענן את הדף.
        </p>
      </main>
    );
  }

  if (!therapist.onboardingCompleted) {
    redirect("/dashboard/onboarding");
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <UserButton />
      </div>
      <p>שלום {therapist.fullName} 👋</p>
      <Button asChild className="w-fit">
        <Link href="/dashboard/availability">ניהול זמינות</Link>
      </Button>
    </main>
  );
}
