import { PageContainer } from "../components/layout/PageContainer";
import { ActiveMaintenanceBanner } from "../components/maintenance/ActiveMaintenanceBanner";
import { CityView } from "../components/city/CityView";

export function City() {
  return (
    <PageContainer title="City">
      <ActiveMaintenanceBanner />
      <CityView />
    </PageContainer>
  );
}
