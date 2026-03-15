export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <span className="text-base font-semibold text-gray-900">
              East Coast Local Admin
            </span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 p-6">
        {children}
      </main>
    </div>
  );
}
