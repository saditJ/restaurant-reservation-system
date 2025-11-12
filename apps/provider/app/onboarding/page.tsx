import { OnboardingWizard } from './OnboardingWizard';

export const revalidate = 0;

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">
          Provider onboarding
        </h1>
        <p className="text-sm text-slate-600">
          Walk through the guided wizard to provision a new tenant, venue, and
          integration key in minutes.
        </p>
      </header>
      <OnboardingWizard />
    </div>
  );
}
