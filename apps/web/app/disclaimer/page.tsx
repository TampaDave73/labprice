import type { Metadata } from 'next';
import StaticPageLayout from '../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'Medical Disclaimer',
  description: 'Medical disclaimer for LabTestCompare.',
};

export default function DisclaimerPage() {
  return (
    <StaticPageLayout title="Medical Disclaimer" updated="July 2026">
      <p className="mb-4">
        LabTestCompare is a price-comparison tool, not a medical provider. Nothing on this site —
        including test descriptions, normal reference ranges, or preparation instructions — is medical
        advice, diagnosis, or treatment, and it is not a substitute for the advice of a qualified
        healthcare professional.
      </p>
      <p className="mb-4">
        Always talk to a doctor or other qualified healthcare provider before ordering a lab test,
        interpreting your results, or making any decision about your health based on information found
        on this site. Reference ranges shown for a test are general and can vary by lab, method, age,
        sex, and other factors — only your ordering lab&apos;s official report and your provider should
        be used to interpret your actual results.
      </p>
      <p className="mb-4">
        If you think you may have a medical emergency, call your doctor or emergency services
        immediately. Do not delay seeking medical advice because of something you read here.
      </p>
      <p className="mb-4">
        Lab tests themselves are ordered from and performed by third-party ordering services and
        laboratories (e.g. Quest Diagnostics, LabCorp) — LabTestCompare does not draw blood, run tests,
        or issue results.
      </p>
    </StaticPageLayout>
  );
}
