import { LanguageProvider } from "@/context/LanguageContext";
import "./globals.css";

export const metadata = {
  title: "Tender-Trace",
  description: "Advanced analytics and transparency portal for Indian public procurement data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
