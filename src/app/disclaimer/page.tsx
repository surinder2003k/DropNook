import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Important disclaimers about using the Dropzone file sharing service.",
  alternates: { canonical: "/disclaimer" },
};

export default function Disclaimer() {
  return (
    <LegalPage title="Disclaimer" updated="January 1, 2025">
      <h2>External links &amp; ads</h2>
      <p>
        Some links and advertisements on this site are provided by third parties,
        including Google AdSense. We do not control and are not responsible for
        the content, products, or services offered by those third parties.
      </p>

      <h2>Accuracy of information</h2>
      <p>
        The information on this site is provided for general purposes only.
        While we aim to keep it accurate, we make no representations or
        warranties about the completeness or reliability of the site.
      </p>

      <h2>Your uploads</h2>
      <p>
        Dropzone does not monitor or moderate uploaded content. The person who
        shares a file is solely responsible for its contents. Do not open files
        from sources you do not trust.
      </p>
    </LegalPage>
  );
}
