import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "About",
  description:
    "Dropzone is a free, no-sign-up tool to share files that disappear once accessed.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <LegalPage title="About Dropzone">
      <p>
        Dropzone is a free, anonymous file handoff tool. Drop a file, get a
        single-use link, and send it anywhere — no account, no email, no
        friction.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>Your file is uploaded straight to secure object storage.</li>
        <li>You get a short, shareable link with optional rules — password, expiry, or a download limit.</li>
        <li>The recipient downloads without needing an account.</li>
      </ul>

      <h2>Why a link that disappears</h2>
      <p>
        A file that lives forever is a liability. Dropzone is designed for
        handoffs: pass the file, then let it go. Set an expiry or download limit
        and the link cleans itself up.
      </p>

      <h2>Built with</h2>
      <p>
        Next.js, TypeScript, and Tailwind CSS, with files stored in Backblaze B2.
      </p>
    </LegalPage>
  );
}
