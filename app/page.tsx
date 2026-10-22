import { ComingUp } from "@/components/ui/ComingUp";
import { ROADMAP, STATUS_LABEL } from "@/lib/roadmap";

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-8">
      <ComingUp title="My Team" phase={4}>
        <p>
          Your starters and bench live here, each with live fantasy points, projected points,
          and how their game is going.
        </p>
        <p>
          First you&apos;ll build a roster by searching for players. Later you&apos;ll be able to
          import your real ESPN league instead.
        </p>
      </ComingUp>

      <section aria-labelledby="progress-heading" className="flex flex-col">
        <h2
          id="progress-heading"
          className="border-b border-line pb-2 font-mono text-[11px] tracking-[0.08em] text-muted uppercase"
        >
          Build progress
        </h2>
        <ol>
          {ROADMAP.map((item) => (
            <li
              key={item.phase}
              className="flex items-center gap-3 border-b border-line-soft py-2.5 text-sm"
            >
              <span className="w-7 font-mono text-[11px] text-muted">
                {String(item.phase).padStart(2, "0")}
              </span>
              <span className={`flex-1 ${item.status === "later" ? "text-muted" : "text-ink"}`}>
                {item.title}
              </span>
              <span
                className={`font-mono text-[10px] tracking-[0.06em] uppercase ${
                  item.status === "building" || item.status === "done" ? "text-gain" : "text-muted"
                }`}
              >
                {STATUS_LABEL[item.status]}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
