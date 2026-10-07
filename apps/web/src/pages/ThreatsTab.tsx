import { useParams } from 'react-router';
import { ThreatsSection } from '../components/ThreatsSection.js';

// The Threats tab: the threats table of Phase 1, unchanged, at the threat model's own address.
export function ThreatsTab() {
  const { threatModelId = '' } = useParams();
  return <ThreatsSection threatModelId={threatModelId} />;
}
