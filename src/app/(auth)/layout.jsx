export default function AuthLayout({ children }) {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm bg-white border rounded-lg p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
