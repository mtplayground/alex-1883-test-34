const workspaceItems = [
  "React frontend scaffolded with Vite",
  "Tailwind CSS pipeline configured",
  "Express backend workspace ready for API routes"
];

export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Issue #1
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
          React and Tailwind frontend workspace
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          This starter app provides the first frontend surface while later
          issues add authentication, profiles, posts, feeds, and social
          interactions.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {workspaceItems.map((item) => (
            <div
              className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-sm"
              key={item}
            >
              <p className="text-sm leading-6 text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
