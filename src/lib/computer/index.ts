import type { ComputerProvider } from "./provider";
import { SandboxComputerProvider } from "./sandbox";
import { RemoteComputerProvider } from "./remote";

/**
 * Computer-provider resolution.
 *
 * This differs from the browser's resolution in one deliberate way. The
 * browser falls back to a labeled sandbox that users can actually see, because
 * a sandbox comparison of example products still demonstrates the loop
 * honestly and costs nobody anything.
 *
 * A computer sandbox does not. "Cosigno operated your machine" is a claim
 * about the user's own desktop, and a synthetic screen that appears to satisfy
 * it is a lie regardless of how it is labeled — nobody reads a warning on a
 * screenshot of their own computer. So `computerUseAvailable()` is false
 * unless a REAL environment is configured, the capability manifest withholds
 * the computer tools when it is, and a goal that needs one is refused with a
 * reason. The sandbox exists solely to make the loop testable.
 */

const sandbox = new SandboxComputerProvider();
const remote = new RemoteComputerProvider();

/** True when a real computer environment is configured. */
export function isLiveComputer(): boolean {
  return remote.isConfigured();
}

/**
 * Whether the computer tools may appear in the capability manifest at all.
 *
 * Only a live environment counts. The test override exists so the loop can be
 * exercised end to end; it is read from the environment, so nothing a request
 * carries can turn it on.
 */
export function computerUseAvailable(): boolean {
  return isLiveComputer() || process.env.COSIGNO_COMPUTER_SANDBOX === "1";
}

export function getComputerProvider(): ComputerProvider {
  return remote.isConfigured() ? remote : sandbox;
}

export { sandbox as sandboxComputerProvider, remote as remoteComputerProvider };
