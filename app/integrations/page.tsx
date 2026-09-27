import { Suspense } from "react";
import { IntegrationsPage } from "@/components/integrations-page";

export default function Page() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense>
      <IntegrationsPage />
    </Suspense>
  );
}
