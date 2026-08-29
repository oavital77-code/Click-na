import { UserButton } from "@clerk/nextjs";
import { getCurrentTherapist } from "@/lib/auth";

export default async function DashboardPage() {
  const therapist = await getCurrentTherapist();

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <UserButton />
      </div>
      {therapist ? (
        <p>שלום {therapist.fullName} 👋</p>
      ) : (
        <p className="text-muted-foreground">
          מסיימים את ההרשמה שלך... אם זה נמשך, רענן את הדף.
        </p>
      )}
    </main>
  );
}
