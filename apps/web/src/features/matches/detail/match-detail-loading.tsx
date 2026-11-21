import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";

export function MatchDetailLoading() {
  return <LoadingState label="Cargando partido…">
    <div className="space-y-6">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-1/2" />
    </div>
  </LoadingState>;
}
