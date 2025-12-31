import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vapi Cron Calls",
  description: "Automated daily check-in calls via Vapi",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


