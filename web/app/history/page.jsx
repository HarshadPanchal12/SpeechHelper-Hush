import { HistoryList } from "@/components/history-list";

export const metadata = { title: "History | Hush" };

export default function HistoryPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-xl space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">History</h1>
        <p className="text-muted-foreground">
          This list is saved in this browser only. The audio itself isn&apos;t kept, so download
          files you want to keep.
        </p>
      </div>
      <HistoryList />
    </div>
  );
}
