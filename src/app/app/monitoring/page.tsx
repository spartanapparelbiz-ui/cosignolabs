import { LiveMonitoring } from "@/components/app/LiveMonitoring";

export const dynamic = "force-dynamic";

export const metadata = { title: "monitoring" };

export default function MonitoringPage() {
  return <LiveMonitoring />;
}
