import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";

export default function Page() {
  if (!clerkEnabled) redirect("/");
  return (
    <div className="flex justify-center pt-8">
      <SignUp />
    </div>
  );
}
