import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Dropzone handles your files and data. We store only what is needed to serve your share link and delete files on request.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="January 1, 2025">
      <p>
        Dropzone is built to collect as little as possible. This policy explains
        what we store, why, and for how long.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>File metadata:</strong> the filename, file type, size, and a
          short share link identifier. This is what powers the download page.
        </li>
        <li>
          <strong>The file itself:</strong> the bytes you upload, stored in
          Backblaze B2 object storage.
        </li>
        <li>
          <strong>Optional share rules:</strong> if you set a password, expiry,
          or download limit, we store a one-way hash of the password and the
          rule settings. We never store your password in readable form.
        </li>
      </ul>

      <h2>What we do not store</h2>
      <ul>
        <li>We do not require an account, and we do not ask for your name or email.</li>
        <li>We do not read the contents of your files.</li>
      </ul>

      <h2>Cookies &amp; advertising</h2>
      <p>
        This site may display ads served by Google AdSense. Google and its
        partners may use cookies to serve ads based on your prior visits to this
        or other websites. You can opt out of personalized advertising in your
        Google account settings, or via industry tools such as{" "}
        <a href="https://optout.aboutads.info" rel="noopener noreferrer nofollow" target="_blank">
          aboutads.info
        </a>
        . Third-party vendors, including Google, use cookies to serve ads based
        on a user&apos;s prior visits to this website.
      </p>

      <h2>Data retention</h2>
      <p>
        Files and their metadata are retained until they are deleted — either by
        you from the file list or automatically once a share link expires or
        reaches its download limit, depending on the rules you set.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us on the{" "}
        <a href="/contact">contact page</a>.
      </p>
    </LegalPage>
  );
}
