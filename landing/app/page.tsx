import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { DistanceBand } from "./_components/DistanceBand";
import { Portals } from "./_components/Portals";
import { AssistantScrub } from "./_components/AssistantScrub";
import { Directory } from "./_components/Directory";
import { Access } from "./_components/Access";
import { Safety } from "./_components/Safety";
import { Waitlist } from "./_components/Waitlist";
import { Footer } from "./_components/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <DistanceBand />
        <Portals />
        <AssistantScrub />
        <Directory />
        <Access />
        <Safety />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
