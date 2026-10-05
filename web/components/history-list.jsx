"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearHistory, readHistory, removeHistory } from "@/lib/history";
import { formatBytes, formatClock, formatElapsed } from "@/lib/format";

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function HistoryList() {
  const [items, setItems] = useState(null);
  useEffect(() => setItems(readHistory()), []);

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8">
        <p className="font-medium">No files yet.</p>
        <p className="mt-1 text-muted-foreground">Files you clean will be listed here.</p>
        <Button asChild className="mt-5">
          <Link href="/">Clean a file</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-2xl border bg-card">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4 p-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-medium">{e.name}</p>
              <p className="text-sm text-muted-foreground">
                {when.format(e.at)}. {formatBytes(e.size)}
                {e.durationSec ? `, ${formatClock(e.durationSec)} long` : ""}. {e.strength} reduction
                {e.elapsedSec ? `, cleaned in ${formatElapsed(e.elapsedSec)}` : ""}.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${e.name} from history`}
              onClick={() => setItems(removeHistory(e.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => setItems(clearHistory())}>
        Clear history
      </Button>
    </div>
  );
}
