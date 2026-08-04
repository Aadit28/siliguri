import { LanguageProvider } from "./_lib/lang";
import { LanguageGate } from "./_components/LanguageGate";
import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { DistanceBand } from "./_components/DistanceBand";
import { Portals } from "./_components/Portals";
import { AssistantDemo } from "./_components/AssistantDemo";
import { Directory } from "./_components/Directory";
import { Access } from "./_components/Access";
import { Safety } from "./_components/Safety";
import { Waitlist } from "./_components/Waitlist";
import { Footer } from "./_components/Footer";

export default function Page() {
  return (
    <LanguageProvider>
      <LanguageGate />
      <Nav />
      <main>
        <Hero />
        <DistanceBand />
        <Portals />
        <AssistantDemo />
        <Directory />
        <Access />
        <Safety />
        <Waitlist />
      </main>
      <Footer />
    </LanguageProvider>
  );
}
