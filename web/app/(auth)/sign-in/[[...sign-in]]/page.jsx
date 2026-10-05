import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";

export default function Page() {
  if (!clerkEnabled) redirect("/");
  return (
    <div className="flex justify-center pt-8">
      <SignIn />
    </div>
  );
}
