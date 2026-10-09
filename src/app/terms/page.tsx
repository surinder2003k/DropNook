import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using Dropzone's free, no-sign-up file sharing service.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="January 1, 2025">
      <p>
        By using Dropzone you agree to these terms. If you do not agree, please
        do not use the service.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not upload anything illegal, harmful, abusive, or infringing.</li>
        <li>Do not upload malware, or use Dropzone to distribute it.</li>
        <li>
          Do not use Dropzone to violate anyone&apos;s privacy or intellectual
          property rights.
        </li>
        <li>Each file is limited to 5 GB.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        Dropzone is provided &quot;as is&quot; without warranties of any kind. We
        do not guarantee that files will be stored forever or that the service
        will be uninterrupted. Keep your own backups of anything important.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Dropzone is not liable for any
        loss or damage arising from your use of the service, including loss of
        data.
      </p>

      <h2>Enforcement</h2>
      <p>
        We may remove files or block access that violate these terms. Because
        Dropzone is no-sign-up, we cannot always identify a user — which is why
        the responsibility for what you upload rests with you.
      </p>
    </LegalPage>
  );
}
