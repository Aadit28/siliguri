import type { Metadata } from "next";
import { DM_Sans, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

// The product ships DM Sans on iOS, Android and web. The landing page uses the
// same face so the marketing surface and the app read as one thing.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoDeva = Noto_Sans_Devanagari({
  variable: "--font-noto-deva",
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const title = "Saathi — elder care and local services in Siliguri";
const description =
  "Verified local services, reminders and an assistant that speaks Hindi, so families can look after their parents in Siliguri from anywhere.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Saathi",
  openGraph: {
    title,
    description,
    type: "website",
    locale: "en_IN",
    siteName: "Saathi",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${notoDeva.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
