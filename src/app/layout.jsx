import "./globals.css";

export const metadata = { title: "Painel Fix v2" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
