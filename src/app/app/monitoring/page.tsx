import { LiveMonitoring } from "@/components/app/LiveMonitoring";

export const dynamic = "force-dynamic";

export const metadata = { title: "Live Monitoring" };

export default function MonitoringPage() {
  return <LiveMonitoring />;
}
