import type { Metadata } from "next";
import { AnchorHeading, LegalLayout } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "terms of service — cosigno",
  description:
    "The legal agreement governing your use of Cosigno, the approval-first AI operator.",
  alternates: { canonical: "https://cosignolabs.com/terms" },
};

const UPDATED = "July 8, 2026";

/**
 * Terms of Service. Legal copy is reproduced verbatim from the approved text —
 * do not paraphrase. The shell + prose styling live in LegalLayout; headings
 * are anchor-linkable via AnchorHeading.
 */
export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated={UPDATED}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) are a legal agreement
        between you and Aethric LLC (&ldquo;Aethric,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your use of Cosigno
        (the &ldquo;Service,&rdquo; at cosignolabs.com). By creating an account
        or using the Service, you agree to these Terms. If you do not agree, do
        not use the Service.
      </p>

      <section>
        <AnchorHeading id="service">1. The Service</AnchorHeading>
        <p>
          Cosigno is an &ldquo;approval-first&rdquo; AI operator. It proposes
          actions in response to your commands and executes only those actions
          you explicitly approve. The Service may connect to third-party tools
          you authorize. We may change, suspend, or discontinue any part of the
          Service at any time.
        </p>
      </section>

      <section>
        <AnchorHeading id="eligibility">2. Eligibility and accounts</AnchorHeading>
        <p>
          You must be at least 18 years old and able to form a binding contract.
          You are responsible for your account, for keeping your credentials
          secure, and for all activity under your account. Notify us immediately
          of any unauthorized use.
        </p>
      </section>

      <section className="rounded-card bg-cream-deep/50 p-5 ring-1 ring-line/70">
        <AnchorHeading id="responsibility">
          3. YOUR RESPONSIBILITY FOR APPROVED ACTIONS
        </AnchorHeading>
        <p className="font-semibold">
          This section is important. Please read it carefully.
        </p>
        <p className="mt-3">
          The Service is designed so that no action with meaningful effect is
          executed unless you approve it. You are solely responsible for every
          action you approve, edit, or authorize through the Service, including
          its consequences. When you approve an action, you direct the Service to
          perform it on your behalf.
        </p>
        <p className="mt-3">You acknowledge and agree that:</p>
        <ul className="mt-2">
          <li>
            AI-generated proposals may be inaccurate, incomplete, or unsuitable,
            and you are responsible for reviewing each proposed action before
            approving it;
          </li>
          <li>you will not approve actions you do not understand or intend;</li>
          <li>
            you are responsible for the accounts, tools, and data you connect,
            and for having the right to connect and act on them;
          </li>
          <li>
            Aethric is not responsible or liable for actions you approve, for the
            results of those actions, or for actions taken by third-party
            services after you approve them.
          </li>
        </ul>
        <p className="mt-3">
          The approval mechanism is a safeguard, not a guarantee. You remain the
          decision-maker.
        </p>
      </section>

      <section>
        <AnchorHeading id="acceptable-use">4. Acceptable use</AnchorHeading>
        <p>You agree not to use the Service to:</p>
        <ul className="mt-2">
          <li>violate any law or the rights of others;</li>
          <li>
            access, process, or act on data you do not have the right to use;
          </li>
          <li>send spam, conduct fraud, or engage in deceptive activity;</li>
          <li>
            attempt to bypass, disable, or defeat the approval mechanism, tier
            controls, rate limits, or security features;
          </li>
          <li>
            attempt to prompt-inject, jailbreak, reverse-engineer, or misuse the
            AI to cause unauthorized actions;
          </li>
          <li>
            upload malicious code or interfere with the Service&rsquo;s operation;
          </li>
          <li>
            resell or provide the Service to third parties except as expressly
            permitted.
          </li>
        </ul>
        <p className="mt-3">
          We may suspend or terminate accounts that violate these Terms.
        </p>
      </section>

      <section>
        <AnchorHeading id="ai-disclaimer">5. AI output disclaimer</AnchorHeading>
        <p>
          The Service uses artificial intelligence. AI output can be wrong,
          biased, or incomplete and should not be relied upon as professional,
          legal, financial, medical, or other expert advice. You are responsible
          for independently verifying anything important before acting on it.
        </p>
      </section>

      <section>
        <AnchorHeading id="third-party">6. Third-party services</AnchorHeading>
        <p>
          The Service may integrate with third-party tools and relies on
          third-party providers (including authentication, hosting, AI, and
          payment providers). We are not responsible for third-party services,
          their availability, or their acts and omissions. Your use of connected
          services is governed by their own terms.
        </p>
      </section>

      <section>
        <AnchorHeading id="billing">
          7. Subscriptions, billing, and refunds
        </AnchorHeading>
        <p>
          Paid plans are billed in advance on a recurring basis (monthly or
          annual) through our payment processor. By subscribing, you authorize
          recurring charges until you cancel. You can cancel anytime;
          cancellation takes effect at the end of the current billing period, and
          access continues until then. Except where required by law or expressly
          offered by us (such as a stated satisfaction guarantee), payments are
          non-refundable. We may change prices with notice; changes apply to the
          next billing period.
        </p>
      </section>

      <section>
        <AnchorHeading id="usage-limits">8. Usage limits</AnchorHeading>
        <p>
          Plans include usage limits (such as a number of actions per cycle). We
          may enforce rate limits and capacity limits to protect the Service. We
          may throttle, suspend, or limit usage that we reasonably believe is
          abusive or that threatens the Service or our costs.
        </p>
      </section>

      <section>
        <AnchorHeading id="ip">9. Intellectual property</AnchorHeading>
        <p>
          The Service, including its software, design, and content (excluding
          your data and content), is owned by Aethric and protected by law. We
          grant you a limited, non-exclusive, non-transferable, revocable license
          to use the Service under these Terms. You retain rights to the content
          you provide. You grant us the limited rights necessary to operate the
          Service, process your commands, and perform actions you approve.
        </p>
      </section>

      <section>
        <AnchorHeading id="disclaimers">10. Disclaimers</AnchorHeading>
        <p className="uppercase">
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
          INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, SECURE, ERROR-FREE, OR THAT AI OUTPUT WILL BE ACCURATE OR
          SUITABLE.
        </p>
      </section>

      <section>
        <AnchorHeading id="liability">11. Limitation of liability</AnchorHeading>
        <p className="uppercase">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, AETHRIC AND ITS OWNERS,
          EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
          PROFITS, DATA, GOODWILL, OR BUSINESS, ARISING FROM OR RELATED TO YOUR
          USE OF THE SERVICE — INCLUDING ANY ACTION YOU APPROVED — EVEN IF ADVISED
          OF THE POSSIBILITY.
        </p>
        <p className="mt-3 uppercase">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, AETHRIC&rsquo;S TOTAL LIABILITY
          FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF
          (A) THE AMOUNT YOU PAID US IN THE THREE (3) MONTHS BEFORE THE CLAIM, OR
          (B) ONE HUNDRED U.S. DOLLARS ($100).
        </p>
        <p className="mt-3">
          Some jurisdictions do not allow certain limitations, so some of the
          above may not apply to you.
        </p>
      </section>

      <section>
        <AnchorHeading id="indemnification">12. Indemnification</AnchorHeading>
        <p>
          You agree to indemnify and hold harmless Aethric from any claims,
          damages, losses, and expenses (including reasonable legal fees) arising
          from your use of the Service, the actions you approve, your content,
          your connected accounts, or your violation of these Terms or the rights
          of others.
        </p>
      </section>

      <section>
        <AnchorHeading id="termination">13. Termination</AnchorHeading>
        <p>
          You may stop using the Service and delete your account at any time. We
          may suspend or terminate your access if you violate these Terms or to
          protect the Service. On termination, your license ends; sections that by
          their nature should survive (including Sections 3, 10, 11, 12) will
          survive.
        </p>
      </section>

      <section>
        <AnchorHeading id="governing-law">
          14. Governing law and disputes
        </AnchorHeading>
        <p>
          These Terms are governed by the laws of the State of Florida, USA,
          without regard to conflict-of-laws rules. You agree that the state and
          federal courts located in Florida will have exclusive jurisdiction,
          except where applicable law grants you rights to bring claims
          elsewhere. You and Aethric agree to first attempt to resolve any dispute
          informally by contacting us.
        </p>
      </section>

      <section>
        <AnchorHeading id="changes">15. Changes to these Terms</AnchorHeading>
        <p>
          We may update these Terms from time to time. If we make material
          changes, we will update the &ldquo;Last updated&rdquo; date and, where
          appropriate, provide additional notice. Continued use after changes
          take effect means you accept the updated Terms.
        </p>
      </section>

      <section>
        <AnchorHeading id="contact">16. Contact</AnchorHeading>
        <p>
          Aethric LLC
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          Florida, United States
        </p>
      </section>

      <p className="mt-4 border-t border-line/70 pt-5 text-sm italic text-ink-soft">
        This document is a template provided for general informational purposes
        and is not legal advice. Aethric LLC should have it reviewed by a
        qualified attorney before relying on it, especially Sections 3, 11, and
        14, which are most important given that the Service acts on users&rsquo;
        connected accounts.
      </p>
    </LegalLayout>
  );
}
