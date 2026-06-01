export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between border-b border-zinc-200 pb-4">
          <h1 className="text-2xl font-semibold">CRM</h1>
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            ゲストで試す
          </button>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">顧客数</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">商談数</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">今週のタスク</p>
            <p className="mt-2 text-3xl font-semibold">0</p>
          </div>
        </section>
      </div>
    </main>
  );
}
