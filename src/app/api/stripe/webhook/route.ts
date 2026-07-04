import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook stub for beta. When billing goes live this will verify the
 * signature (STRIPE_WEBHOOK_SECRET), then map subscription events to plan
 * limits in the usage table and record metered action usage.
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "not_configured", message: "Billing is not enabled in beta." },
      { status: 501 }
    );
  }
  // Signature verification + event handling lands with the billing release.
  await req.text();
  return NextResponse.json({ received: true });
}
