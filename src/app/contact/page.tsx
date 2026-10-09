import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Dropzone team.",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <LegalPage title="Contact">
      <p>
        Have a question, a bug report, or a legal request? We&apos;d love to hear
        from you.
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:support@dropnook.vercel.app">support@dropnook.vercel.app</a>
        </li>
        <li>
          Issues &amp; source:{" "}
          <a
            href="https://github.com/surinder2003k/DropNook"
            rel="noopener noreferrer"
            target="_blank"
          >
            github.com/surinder2003k/DropNook
          </a>
        </li>
      </ul>
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        We typically reply within a few business days.
      </p>
    </LegalPage>
  );
}
