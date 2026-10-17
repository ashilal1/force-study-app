import Link from "next/link";
import { Countdown } from "@/components/brand/countdown";
import { Sticker } from "@/components/brand/sticker";
import { formatJstTime } from "@/lib/time";
import type { Todo } from "@/lib/todo";
import { cn } from "@/lib/utils";

/** 「あなたがやること」: one tappable row per open task, soonest first. */
export function TodoList({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) {
    return (
      <Sticker tone="mint" shadow="sm" className="px-4 py-3 text-sm font-bold">
        今やることはありません ✓
      </Sticker>
    );
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {todos.map((todo) => (
        <li key={todo.key}>
          <Link href={todo.href} className="block">
            <Sticker
              shadow="sm"
              tone={todo.urgent ? "tape" : "white"}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5"
            >
              <b className="text-sm">{todo.label}</b>
              {todo.dueAt ? (
                <span className={cn("text-right font-en text-sm tabular-nums", todo.urgent && "text-red")}>
                  {formatJstTime(todo.dueAt)}
                  <span className="block text-[0.7rem]">
                    あと <Countdown until={todo.dueAt} />
                  </span>
                </span>
              ) : (
                <span aria-hidden className="text-lg">
                  →
                </span>
              )}
              {todo.detail ? <span className="col-span-2 text-xs font-medium text-sub">{todo.detail}</span> : null}
            </Sticker>
          </Link>
        </li>
      ))}
    </ul>
  );
}
