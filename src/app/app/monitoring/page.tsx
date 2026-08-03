import { LiveMonitoring } from "@/components/app/LiveMonitoring";

export const dynamic = "force-dynamic";

export const metadata = { title: "live monitoring — cosigno" };

export default function MonitoringPage() {
  return <LiveMonitoring />;
}
