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
  byNewest,
  byTitle,
  daysOpen,
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
 *
 * A job is one line — "63 - Pass side out" — and the row shows that line and
 * where it came from. Nothing on the board is ranked above anything else on it;
 * see byNewest.
 */

const SHELVES: { key: Shelf; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
  { key: "archived", label: "Archive" },
];

/**
 * The two orders the board can be read in.
 *
 * `recent` is what the board has always done and is still the default: newest
 * first on To do, most recently finished on the other two. It is the order for
 * catching up — what happened last night, what got signed off this week.
 *
 * `name` is the other question entirely, and it is the one the list could not
 * answer. A job is "63 - Pass side out", so by name means by van, and somebody
 * walking out to 214 wants everything on 214 together rather than scattered
 * down a month of reports. See byTitle.
 *
 * Two, not five. This is a to-do list, and the moment a board like this grows
 * a sort menu it grows a wrong setting somebody left it on.
 */
type SortKey = "recent" | "name";

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: "recent", label: "Newest", hint: "Sort by when it was reported" },
  { key: "name", label: "A–Z", hint: "Sort by van and fault" },
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
  /**
   * Which order the three lists are in.
   *
   * One setting across all three rather than one each. They are the same jobs
   * at different ages — that is the whole argument for the tabs being tabs —
   * and a board that silently reordered itself when you changed tab would be
   * three boards wearing one hat.
   */
  const [sort, setSort] = useState<SortKey>("recent");
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

    /* By name it is one comparator for all three, because a van is a van
       wherever it has got to. By date each list keeps the clock it is actually
       about: To do is when the fault was reported, Done and Archive are when
       somebody saw to it, which is the question being asked of a finished job. */
    const order = sort === "name" ? byTitle : null;

    return {
      todo: todo.sort(order ?? byNewest),
      done: done.sort(order ?? byFinished),
      archived: archived.sort(order ?? byFinished),
    };
  }, [tasks, now, lingering, sort]);

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
              ? " "
              : lists.todo.length === 0
                ? "Nothing outstanding. Every van is signed off."
                : `${lists.todo.length} ${lists.todo.length === 1 ? "job" : "jobs"} outstanding`}
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

      {/* Which jobs on the left, what order on the right. Two questions about
          one list, side by side, because they are asked together — "what is
          still outstanding, and put 214 together while you are at it". */}
      <div className="flex items-center gap-2">
        {/* Scrolls rather than wraps on a narrow phone. Three tabs and their
            counts fit a 390px screen, but "Archive · 128" late in the year does
            not, and a tab row that reflows to two lines moves the list under
            the thumb that was reaching for it. */}
        <div
          role="tablist"
          aria-label="Which jobs to show"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
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

        {/* A segmented pair rather than a dropdown. Two options is not a menu,
            and a native select on a phone opens a wheel for a choice that
            should cost one tap. Never scrolls away with the tabs — the whole
            point of it is that it applies to whichever one is showing. */}
        <div
          role="group"
          aria-label="Sort the board"
          className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5"
        >
          {SORTS.map((option) => {
            const active = sort === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                title={option.hint}
                onClick={() => setSort(option.key)}
                className={`min-h-10 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                  active
                    ? "bg-caution-soft text-caution"
                    : "text-ink-muted active:brightness-[0.97]"
                }`}
              >
                {option.label}
                <span className="sr-only"> — {option.hint}</span>
              </button>
            );
          })}
        </div>
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
                age={now === null ? null : daysOpen(task, now)}
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
          onSave={(title) => {
            setEditing(null);
            if (editing === "new") {
              run("That job", addRepair(manualRepair(title), uid));
            } else {
              run("That change", editRepair(editing.id, title, uid));
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
  age,
  leaving,
  onToggle,
  onOpen,
}: {
  task: RepairTask;
  /** Days before it moves to the archive, or null when that is not the question. */
  daysLeft: number | null;
  /** Whole days since the job was written, or null before the clock resolves. */
  age: number | null;
  /** Just ticked off, and on its way to Done. See `lingering`. */
  leaving: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-xl border border-line bg-surface transition-opacity duration-500 ${
        leaving ? "opacity-55" : ""
      }`}
    >
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
        {/* The whole job, van number and all. `whitespace-pre-wrap` because the
            van issues column arrives with the closer's own line breaks in it
            and a fault typed on three lines should stay on three. */}
        <span
          className={`block whitespace-pre-wrap text-[15px] font-semibold leading-snug ${
            task.done ? "text-ink-muted line-through decoration-ink-faint" : "text-ink"
          }`}
        >
          {task.title}
        </span>

        {/* Where it came from on the left, how long it has been here on the
            right. They belong on one line because they are the two halves of
            the same question — when was this reported, and how long ago was
            that — and the age sits in the corner so a list of them reads down
            the right-hand edge without anybody hunting for it. */}
        <span className="mt-1.5 flex items-end justify-between gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* In the order it gets asked for: what night, who was driving.
                The van is not here — it is the front of the line above, which
                is the only place it needs to be said. */}
            {task.nightKey || task.driverName || task.source === "manual" ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-none text-ink-faint">
                {task.nightKey ? (
                  <span>
                    {stationDateLabel(new Date(`${task.nightKey}T12:00:00Z`))}
                  </span>
                ) : null}
                {task.nightKey && task.driverName ? <Dot /> : null}
                {task.driverName ? <span>{task.driverName}</span> : null}
                {task.source === "manual" ? <span>Added by hand</span> : null}
              </span>
            ) : null}

            {/* Only on the Done list, and only as long as it is true. Somebody
                wondering where last month's work went should find the answer on
                the row itself rather than in a tab they have not opened. */}
            {daysLeft !== null ? (
              <span className="block text-[11px] font-medium text-ink-faint">
                Moves to the archive in {daysLeft}{" "}
                {daysLeft === 1 ? "day" : "days"}
              </span>
            ) : null}
          </span>

          {age !== null ? <Age days={age} done={task.done} /> : null}
        </span>
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
 * How long this job has been on the board.
 *
 * The thing the date could not say. "Wed 3 Sep" is precise and means nothing
 * on its own — working out that it is three weeks old is arithmetic somebody
 * has to do standing in a workshop, against a date that gets a month further
 * away every month. A number of days is the answer to the question the date
 * was being read for.
 *
 * Grey, and the same grey however old it is. There is a real temptation to
 * turn thirty days red, and it is the wrong instinct on this board: nothing
 * here outranks anything else, a fault is a line somebody has to see to, and
 * the sheet already says GROUNDED inside the line when the van is off the
 * road. An age that shouted would be this file inventing a priority out of a
 * timestamp — see byNewest, which refuses the same thing.
 *
 * Past tense once it is ticked off, because the number stops running then in
 * every sense that matters: "12 days" on a finished job reads as still
 * waiting. Read out in full to a screen reader, since "12d" is not a word.
 */
function Age({ days, done }: { days: number; done: boolean }) {
  const label = days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"}`;

  return (
    <span
      className="tnum shrink-0 self-end font-mono text-[11px] font-medium leading-none text-ink-faint"
      title={done ? `Sat on the board ${label}` : `Open ${label}`}
    >
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">
        {days === 0
          ? "Opened today"
          : `${done ? "Sat on the board for" : "Open for"} ${label}`}
      </span>
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
