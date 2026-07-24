import { FloatingPanel } from "@/components/FloatingPanel";

export function PanelPage() {
  return (
    <div className="page-bg flex flex-1 justify-center overflow-y-auto px-6 py-10">
      <div className="h-fit">
        <FloatingPanel />
      </div>
    </div>
  );
}
