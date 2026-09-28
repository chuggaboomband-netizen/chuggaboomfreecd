import { redirect } from "next/navigation";

export default function LegacyUpsellPage() {
  redirect("/offer" as never);
}
