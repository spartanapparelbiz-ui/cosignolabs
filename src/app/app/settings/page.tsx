import { redirect } from "next/navigation";

// Settings became the account center.
export default function SettingsRedirect() {
  redirect("/app/account");
}
