import Landing from '@/components/Landing';
import { DESIGN_MEDIA } from '@/lib/design-media';
import './landing.css';
export default function Page() {
  return (
    <>
      {/* The hero video's poster is the landing page's largest contentful paint; fetch it first. */}
      <link rel="preload" as="image" href={DESIGN_MEDIA.meridialLight.poster} fetchPriority="high" />
      <Landing />
    </>
  );
}
