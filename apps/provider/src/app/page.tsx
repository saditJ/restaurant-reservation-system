export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <header className="w-full max-w-3xl flex items-center justify-between py-6">
        <div className="text-xl font-semibold">YourBrand Reserve</div>
        <nav className="text-sm">
          <a href="#features" className="mr-4 hover:underline">Features</a>
          <a href="#pricing" className="hover:underline">Pricing</a>
        </nav>
      </header>

      <section className="w-full max-w-3xl text-center py-16">
        <h1 className="text-3xl md:text-5xl font-bold">
          Reservations made simple for every restaurant
        </h1>
        <p className="mt-4 text-gray-600">
          A local, self-hosted alternative to big platforms. Multi-restaurant ready.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {/* Restaurants (B2B) */}
          <a
            href="/signup"
            className="inline-block rounded-xl px-6 py-3 bg-black text-white"
          >
            For Restaurants → Start free
          </a>

          {/* Temporary demo link for guests (B2C) */}
          <a
            href={process.env.NEXT_PUBLIC_BOOKING_DEMO_URL ?? '/booking-demo'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-xl px-6 py-3 border"
          >
            Try Booking Demo
          </a>
        </div>
      </section>

      <section id="features" className="w-full max-w-3xl grid gap-4 md:grid-cols-3 py-12">
        <div className="border rounded-2xl p-4">
          <div className="font-semibold">Floor Plan (2D)</div>
          <div className="text-sm text-gray-600">Draw tables, set capacity.</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="font-semibold">Online Booking</div>
          <div className="text-sm text-gray-600">Pick a table or auto-assign.</div>
        </div>
        <div className="border rounded-2xl p-4">
          <div className="font-semibold">Multi-Restaurant</div>
          <div className="text-sm text-gray-600">One platform, many venues.</div>
        </div>
      </section>

      <section id="pricing" className="w-full max-w-3xl py-12">
        <div className="border rounded-2xl p-6 text-center">
          <div className="text-lg font-semibold">Simple pricing</div>
          <div className="text-sm text-gray-600 mt-2">We’ll add real plans later.</div>
        </div>
      </section>

      <footer className="w-full max-w-3xl py-10 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} YourBrand Reserve
      </footer>
    </main>
  );
}
