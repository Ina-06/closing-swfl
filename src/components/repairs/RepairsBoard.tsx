"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { TaskSheet } from "@/components/repairs/TaskSheet";
import { ErrorNote, SoftWarning } from "@/components/ui/Field";
import {
  addRepair,
  editRepair,
  removeRepair,
  setRepairDone,
  useRepairs,
} from "@/lib/db/repairs";
import {
  ARCHIVE_AFTER_DAYS,
  byFinished,
  byUrgency,
  daysUntilArchive,
  manualRepair,
  shelfFor,
  type Shelf,
} from "@/lib/repairs";
import { stationDateLabel } from "@/lib/constants";
import type { RepairTask } from "@/lib/types";

/**
 * The repairs board.
 *
 * One list, filtered three ways, and the filter is the clock rather than
 * anything anybody presses. A task is on To do until it is ticked off, on Done
 * for a month afterwards, and in the Archive from then on — so the two
 * transitions that matter are a tap and the passage of time, and neither of
 * them is a thing to remember to do.
 *
 * That is why the three lists are tabs on one screen rather than three screens.
 * They are the same rows at different ages, and a task moving between them is
 * not a task going anywhere.
 */

const SHELVES: { key: Shelf; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
  { key: "archived", label: "Archive" },
];

/**
 * How long a ticked job stays on the list it was ticked on.
 *
 * Long enough to watch it happen, short enough that nobody wonders whether it
 * worked. Under a second and the row is gone before the eye gets back to it;
 * much over two and it reads as stuck.
 */
const LINGER_MS = 2200;

/**
 * Today, to the hour, as the thing the archive clock is measured against.
 *
 * Null on the server: how many days are left on a task is a fact about now,
 * and rendering one at build time would freeze it. Re-read on focus and on the
 * hour, because this board is left open on an office laptop for days at a
 * stretch and a countdown that is three days stale is worse than none.
 */
function useNow(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, 60 * 60 * 1000);
      window.addEventListener("focus", onChange);
      return () => {
        clearInterval(timer);
        window.removeEventListener("focus", onChange);
      };
    },
    () => Math.floor(Date.now() / (60 * 60 * 1000)) * 60 * 60 * 1000,
    () => null,
  );
}

export function RepairsBoard({ uid }: { uid: string }) {
  const { tasks, loading, capped, error } = useRepairs();
  const [shelf, setShelf] = useState<Shelf>("todo");
  /** The task being edited, "new" while one is being typed, null otherwise. */
  const [editing, setEditing] = useState<RepairTask | "new" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Jobs ticked off in the last couple of seconds, held where they were.
   *
   * A job that is ticked belongs on Done, and without this it goes there the
   * instant the box is tapped — the row vanishes from under the thumb that
   * tapped it. That is the single most-used control on the board and the one
   * place it must be obvious that something happened, so the row stays put
   * with the tick in it, struck through, long enough to be seen leaving.
   *
   * Only ticking off, never un-ticking. Putting a job back is already visible:
   * it reappears on the list the person is looking at.
   */
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const now = useNow();

  /**
   * The three lists, in the order each of them is read.
   *
   * Worked out here rather than in three filters down the page so the counts
   * on the tabs and the rows underneath them can never disagree — the number
   * on Done is the length of the list Done shows, by construction.
   *
   * Before the clock has resolved every ticked task sits on Done. That is the
   * safe way round: a task shown for a moment longer than it should be is
   * nothing, a month of finished work briefly missing is alarming.
   */
  const lists = useMemo(() => {
    const todo: RepairTask[] = [];
    const done: RepairTask[] = [];
    const archived: RepairTask[] = [];

    for (const task of tasks) {
      const where = lingering.has(task.id)
        ? "todo"
        : now === null
          ? task.done
            ? "done"
            : "todo"
          : shelfFor(task, now);

      if (where === "todo") todo.push(task);
      else if (where === "done") done.push(task);
      else archived.push(task);
    }

    return {
      todo: todo.sort(byUrgency),
      done: done.sort(byFinished),
      archived: archived.sort(byFinished),
    };
  }, [tasks, now, lingering]);

  const grounded = lists.todo.filter((task) => task.grounded).length;
  const showing = lists[shelf];

  /**
   * Every write on this board goes through here.
   *
   * Nothing is awaited before the sheet closes and nothing blocks the list:
   * Firestore surfaces the change locally the instant it is queued, so the row
   * ticks, moves or disappears immediately whether or not there is signal. What
   * this is for is the other half — a write the server later refuses has to say
   * so out loud, because the row will quietly snap back and a board that
   * un-ticks itself with no explanation is a board nobody trusts.
   */
  function run(what: string, write: Promise<unknown>) {
    setFailure(null);
    write.catch((err: unknown) => {
      setFailure(
        err instanceof Error ? `${what}: ${err.message}` : `${what} did not save.`,
      );
    });
  }

  /**
   * The box on the left of a row.
   *
   * The write goes off immediately — Firestore shows it locally before it
   * leaves the device — and the row is pinned in place for a moment on the way
   * out. If the server later refuses the write the row snaps back on its own
   * and `run` says why, which is the one case where a job un-ticking itself is
   * the correct thing to see.
   */
  function toggle(task: RepairTask) {
    if (!task.done) {
      setLingering((held) => new Set(held).add(task.id));
      window.setTimeout(() => {
        setLingering((held) => {
          const next = new Set(held);
          next.delete(task.id);
          return next;
        });
      }, LINGER_MS);
    }

    run(
      task.done ? "Putting that back" : "Ticking that off",
      setRepairDone(task.id, !task.done, uid),
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
            Repairs
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            {loading
              ? " "
              : lists.todo.length === 0
                ? "Nothing outstanding. Every van is signed off."
                : `${lists.todo.length} ${lists.todo.length === 1 ? "job" : "jobs"} outstanding${
                    grounded > 0
                      ? ` · ${grounded} ${grounded === 1 ? "van" : "vans"} off the road`
                      : ""
                  }`}
          </p>
        </div>

        {/* Whole-word label rather than a bare plus. This board is opened by
            whoever is free, not by one person who has learned it. */}
        <button
          type="button"
          onClick={() => {
            setFailure(null);
            setEditing("new");
          }}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-caution-line bg-caution-soft px-4 text-[14px] font-bold text-caution transition-colors active:brightness-[0.97]"
        >
          <span aria-hidden="true" className="text-[17px] leading-none">
            +
          </span>
          Add a job
        </button>
      </header>

      {error ? (
        <ErrorNote>
          Could not read the repairs board: {error}. If this says permission
          denied, the Firestore rules may not be published yet.
        </ErrorNote>
      ) : null}
      {failure ? <ErrorNote>{failure}</ErrorNote> : null}

      {capped ? (
        <SoftWarning>
          This board is showing the {tasks.length} most recent jobs, which is as
          many as it holds. Anything older is still in the database but is not
          on this screen.
        </SoftWarning>
      ) : null}

      {/* Scrolls rather than wraps on a narrow phone. Three tabs and their
          counts fit a 390px screen, but "Archive · 128" late in the year does
          not, and a tab row that reflows to two lines moves the list under the
          thumb that was reaching for it. */}
      <div
        role="tablist"
        aria-label="Which jobs to show"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {SHELVES.map((option) => {
          const active = shelf === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setShelf(option.key)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors ${
                active
                  ? "border-caution-line bg-caution-soft text-caution"
                  : "border-line bg-surface text-ink-muted active:brightness-[0.97]"
              }`}
            >
              {option.label}
              <span
                className={`tnum font-mono text-[12px] font-bold ${
                  active ? "text-caution" : "text-ink-faint"
                }`}
              >
                {loading ? "" : lists[option.key].length}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          className="h-56 animate-pulse rounded-xl border border-line bg-surface"
          aria-busy="true"
          aria-label="Loading the repairs board"
        />
      ) : showing.length === 0 ? (
        <Empty shelf={shelf} />
      ) : (
        <ul className="space-y-2">
          {showing.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                daysLeft={now === null ? null : daysUntilArchive(task, now)}
                leaving={lingering.has(task.id)}
                onToggle={() => toggle(task)}
                onOpen={() => {
                  setFailure(null);
                  setEditing(task);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="pt-1 text-[12px] leading-relaxed text-ink-faint">
        Van issues land here on their own when the closer ends the night. A job
        stays on this list until somebody ticks it off, then sits under Done for{" "}
        {ARCHIVE_AFTER_DAYS} days before it moves to the archive.
      </p>

      {editing ? (
        <TaskSheet
          key={editing === "new" ? "new" : editing.id}
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            setEditing(null);
            if (editing === "new") {
              run(
                "That job",
                addRepair(
                  manualRepair(fields.title, fields.van, fields.grounded),
                  uid,
                ),
              );
            } else {
              run("That change", editRepair(editing.id, fields, uid));
            }
          }}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  setEditing(null);
                  run("Removing that job", removeRepair(editing.id));
                }
          }
        />
      ) : null}
    </div>
  );
}

/**
 * One job.
 *
 * Two controls side by side rather than one row that does both, because they
 * do genuinely different things and the wrong one at midnight is expensive:
 * the box on the left says the van is fixed, the rest of the row opens what it
 * says for correction. A single tappable row would have to guess, and every
 * guess it made would be wrong half the time.
 *
 * The box is a real checkbox to a screen reader and a 44px target to a thumb,
 * which is most of why it is a button with a role rather than an `<input>` —
 * the other reason is that an input inside this layout cannot be made big
 * enough to hit without also being ugly.
 */
function TaskRow({
  task,
  daysLeft,
  leaving,
  onToggle,
  onOpen,
}: {
  task: RepairTask;
  /** Days before it moves to the archive, or null when that is not the question. */
  daysLeft: number | null;
  /** Just ticked off, and on its way to Done. See `lingering`. */
  leaving: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  /**
   * Grounded is the only thing on this board allowed to be red, and only while
   * it is still outstanding. A grounded van that has been fixed is a van, and
   * carrying the alarm into the Done list would leave the archive permanently
   * shouting about work that is finished.
   */
  const loud = task.grounded && !task.done;

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-xl border bg-surface transition-opacity duration-500 ${
        loud ? "border-overdue-line" : "border-line"
      } ${leaving ? "opacity-55" : ""}`}
    >
      {loud ? (
        <span aria-hidden="true" className="w-1 shrink-0 bg-overdue" />
      ) : null}

      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${task.done ? "Put back" : "Tick off"}: ${task.title}`}
        onClick={onToggle}
        className="grid w-12 shrink-0 place-items-center self-stretch transition-colors active:bg-sunken"
      >
        <span
          className={`grid size-6 place-items-center rounded-md border-2 transition-colors ${
            task.done
              ? "border-arrived bg-arrived text-ink-inverse"
              : "border-line-strong bg-surface"
          }`}
        >
          {task.done ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="M5 12.5l5 5 9-10.5" />
            </svg>
          ) : null}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit: ${task.title}`}
        className="min-w-0 flex-1 py-3 pr-3 text-left transition-colors active:bg-sunken"
      >
        <span
          className={`block text-[15px] font-semibold leading-snug ${
            task.done ? "text-ink-muted line-through decoration-ink-faint" : "text-ink"
          }`}
        >
          {task.title}
        </span>

        {task.detail.trim() ? (
          <span className="mt-1 block whitespace-pre-wrap text-[13px] leading-snug text-ink-muted">
            {task.detail}
          </span>
        ) : null}

        {/* Where it came from, in the order it gets asked for: which van, what
            night, who was driving. The van is first and bold because it is the
            only one of the three anybody searches the screen for. */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-none text-ink-faint">
          {task.van ? (
            <span className="tnum font-mono font-bold text-ink-muted">
              Van {task.van}
            </span>
          ) : (
            <span className="italic">No van number</span>
          )}
          {task.nightKey ? <Dot /> : null}
          {task.nightKey ? (
            <span>{stationDateLabel(new Date(`${task.nightKey}T12:00:00Z`))}</span>
          ) : null}
          {task.driverName ? <Dot /> : null}
          {task.driverName ? <span>{task.driverName}</span> : null}
          {task.source === "manual" ? <Dot /> : null}
          {task.source === "manual" ? <span>Added by hand</span> : null}
        </span>

        {/* Only on the Done list, and only as long as it is true. Somebody
            wondering where last month's work went should find the answer on
            the row itself rather than in a tab they have not opened. */}
        {daysLeft !== null ? (
          <span className="mt-1.5 block text-[11px] font-medium text-ink-faint">
            Moves to the archive in {daysLeft} {daysLeft === 1 ? "day" : "days"}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-line-strong">
      ·
    </span>
  );
}

/**
 * Nothing on this list, said in the words of the list it is.
 *
 * An empty To do is good news and should read like it; an empty archive is
 * simply early. One shared "Nothing here" would make the best state on the
 * board look like a loading failure.
 */
function Empty({ shelf }: { shelf: Shelf }) {
  const COPY: Record<Shelf, { title: string; blurb: string }> = {
    todo: {
      title: "Nothing outstanding",
      blurb:
        "Every van is signed off. Jobs appear here on their own when the closer ends the night with something written against a van.",
    },
    done: {
      title: "Nothing ticked off yet",
      blurb: `Jobs land here when somebody ticks them off, and stay for ${ARCHIVE_AFTER_DAYS} days before moving to the archive.`,
    },
    archived: {
      title: "The archive is empty",
      blurb: `Finished jobs move here ${ARCHIVE_AFTER_DAYS} days after they are ticked off. Nothing is ever removed from it.`,
    },
  };
  const copy = COPY[shelf];

  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-5 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink-muted">{copy.title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-faint">
        {copy.blurb}
      </p>
    </div>
  );
}
