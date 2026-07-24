import type { Metadata } from "next";
import { AnchorHeading, LegalLayout } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "privacy policy — cosigno",
  description:
    "How Cosigno (Aethric LLC) collects, uses, shares, and protects your information.",
  alternates: { canonical: "https://cosignolabs.com/privacy" },
};

const UPDATED = "July 9, 2026";

/**
 * Privacy Policy. The practices described here mirror what the app actually
 * does (Supabase auth + storage, a third-party AI provider for planning,
 * Stripe billing, Upstash rate limiting, Cloudflare bot protection, Netlify
 * hosting). The AI provider is referred to generically, consistent with the
 * rest of the product. Like the Terms, this is a template pending attorney
 * review — see the closing note.
 */
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={UPDATED}>
      <p>
        This Privacy Policy explains how Aethric LLC (&ldquo;Aethric,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses,
        shares, and protects information when you use Cosigno (the
        &ldquo;Service,&rdquo; at cosignolabs.com). By using the Service, you
        agree to this Policy. If you do not agree, do not use the Service. This
        Policy is part of, and should be read with, our{" "}
        <a href="/terms">Terms of Service</a>.
      </p>

      <section>
        <AnchorHeading id="who-we-are">1. Who we are</AnchorHeading>
        <p>
          Aethric LLC, based in Florida, United States, is the controller of the
          personal information described in this Policy. You can reach us at{" "}
          <a href="mailto:hello@aethric.llc">hello@aethric.llc</a>.
        </p>
      </section>

      <section>
        <AnchorHeading id="what-we-collect">
          2. Information we collect
        </AnchorHeading>
        <p>We collect the following, most of it because you provide it directly:</p>
        <ul className="mt-2">
          <li>
            <strong>Account information.</strong> When you create an account we
            collect your email address and authentication details through our
            authentication provider. We store an account identifier for you.
          </li>
          <li>
            <strong>Commands and content.</strong> The commands you give the
            operator, and any content you or your connected tools provide for a
            command, are processed to plan and (once you approve) carry out
            actions.
          </li>
          <li>
            <strong>Actions and audit trail.</strong> Every proposal, approval,
            edit, veto, and execution — with its payload and timestamps — is
            recorded so you have a complete, reviewable history.
          </li>
          <li>
            <strong>Connected-tool data.</strong> If you connect third-party
            tools, we access data from them only as needed to plan and perform
            the actions you approve, under the authorization you grant.
          </li>
          <li>
            <strong>Billing information.</strong> If you subscribe to a paid plan,
            our payment processor collects and processes your payment details. We
            do not receive or store your full card number; we keep limited billing
            records (such as your plan, status, and customer identifier).
          </li>
          <li>
            <strong>Usage and device data.</strong> We collect limited technical
            information — such as log data, approximate request metadata, and
            counters used to enforce rate limits — to operate, secure, and improve
            the Service.
          </li>
        </ul>
      </section>

      <section>
        <AnchorHeading id="how-we-use">
          3. How we use your information
        </AnchorHeading>
        <p>We use the information above to:</p>
        <ul className="mt-2">
          <li>provide, maintain, and improve the Service;</li>
          <li>
            plan proposed actions and, only after your approval, execute them;
          </li>
          <li>maintain your audit trail and usage meter;</li>
          <li>process payments and manage subscriptions;</li>
          <li>
            secure the Service — prevent abuse and fraud, enforce rate and
            capacity limits, and protect our costs;
          </li>
          <li>respond to your requests and provide support;</li>
          <li>comply with legal obligations.</li>
        </ul>
      </section>

      <section>
        <AnchorHeading id="ai-processing">4. AI processing</AnchorHeading>
        <p>
          To turn your command into proposed actions, the Service sends your
          command and any content it needs to read to a third-party AI provider
          that generates the proposals. That provider processes this input to
          return proposals for your review and does not use it to train its
          models. Content read from external sources is treated as untrusted
          data: the operator will not follow instructions hidden inside it, and
          any action influenced by suspicious content is flagged and held for your
          review rather than executed.
        </p>
      </section>

      <section>
        <AnchorHeading id="how-we-share">
          5. How we share information
        </AnchorHeading>
        <p>
          We do not sell your personal information. We share it only in these
          cases:
        </p>
        <ul className="mt-2">
          <li>
            <strong>Service providers (subprocessors)</strong> who process data
            on our behalf to run the Service, including: authentication,
            database, and storage (Supabase), a third-party AI provider (for
            planning), payments (Stripe), hosting (Netlify), rate limiting
            (Upstash), and bot protection (Cloudflare Turnstile). Each processes
            data only as needed to provide its function.
          </li>
          <li>
            <strong>Connected tools you authorize</strong> — we exchange data with
            them only as directed by your commands and approvals.
          </li>
          <li>
            <strong>Legal and safety</strong> — when required by law, to enforce
            our Terms, or to protect the rights, property, or safety of Aethric,
            our users, or others.
          </li>
          <li>
            <strong>Business transfers</strong> — in connection with a merger,
            acquisition, or sale of assets, subject to this Policy.
          </li>
        </ul>
      </section>

      <section>
        <AnchorHeading id="cookies">
          6. Cookies and similar technologies
        </AnchorHeading>
        <p>
          We use essential cookies to keep you signed in and to operate the
          Service securely. These are necessary for the Service to function. We do
          not use advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <AnchorHeading id="retention">7. Data retention</AnchorHeading>
        <p>
          We retain your information for as long as your account is active or as
          needed to provide the Service. When you delete your account, we delete
          or de-identify your workspace data, except where we must retain certain
          records to comply with legal obligations, resolve disputes, or enforce
          our agreements (for example, billing records).
        </p>
      </section>

      <section>
        <AnchorHeading id="security">8. Security</AnchorHeading>
        <p>
          We use technical and organizational measures designed to protect your
          information, including access controls, encryption in transit, and a
          server-side execution boundary so approved actions run only after your
          signature. No method of transmission or storage is perfectly secure,
          and we cannot guarantee absolute security. Keep your credentials
          confidential and notify us of any unauthorized use.
        </p>
      </section>

      <section>
        <AnchorHeading id="your-rights">
          9. Your rights and choices
        </AnchorHeading>
        <p>
          Depending on where you live, you may have rights to access, correct,
          export, or delete your personal information, and to object to or
          restrict certain processing. You can review and export your audit trail
          in the app, and you can delete your account at any time from your
          account settings. To make a request or ask a question, contact{" "}
          <a href="mailto:hello@aethric.llc">hello@aethric.llc</a>. We will
          respond as required by applicable law.
        </p>
      </section>

      <section>
        <AnchorHeading id="children">10. Children</AnchorHeading>
        <p>
          The Service is not intended for anyone under 18, and we do not knowingly
          collect personal information from children. If you believe a child has
          provided us information, contact us and we will delete it.
        </p>
      </section>

      <section>
        <AnchorHeading id="international">
          11. International users
        </AnchorHeading>
        <p>
          We operate in the United States, and our providers may process your
          information in the United States and other countries. By using the
          Service, you understand your information may be transferred to and
          processed in countries whose data-protection laws may differ from those
          of your country.
        </p>
      </section>

      <section>
        <AnchorHeading id="changes">12. Changes to this Policy</AnchorHeading>
        <p>
          We may update this Policy from time to time. If we make material
          changes, we will update the &ldquo;Last updated&rdquo; date and, where
          appropriate, provide additional notice. Continued use after changes take
          effect means you accept the updated Policy.
        </p>
      </section>

      <section>
        <AnchorHeading id="contact">13. Contact</AnchorHeading>
        <p>
          Aethric LLC
          <br />
          Email: <a href="mailto:hello@aethric.llc">hello@aethric.llc</a>
          <br />
          Florida, United States
        </p>
      </section>

      <p className="mt-4 border-t border-line/70 pt-5 text-sm italic text-ink-soft">
        This document is a template provided for general informational purposes
        and is not legal advice. Aethric LLC should have it reviewed by a
        qualified attorney — and confirmed against the data practices of its
        providers and any applicable privacy laws — before relying on it.
      </p>
    </LegalLayout>
  );
}
