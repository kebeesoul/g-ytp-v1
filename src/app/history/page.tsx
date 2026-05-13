import { HistoryGrid } from "@/components/history/HistoryGrid";

export const metadata = { title: "History — g-ytp-v1" };

export default function HistoryPage() {
  return (
    <div className="min-h-full bg-gray-950 px-6 py-8">
      <h1 className="mb-6 text-xl font-semibold text-white">과거 익스포트 프로젝트</h1>
      <HistoryGrid />
    </div>
  );
}
