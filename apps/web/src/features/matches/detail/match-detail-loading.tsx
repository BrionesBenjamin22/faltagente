import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./match-detail.module.css";

export function MatchDetailLoading() {
  return <LoadingState label="Cargando partido…">
    <div className={styles.loadingHero} aria-hidden="true">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-16 w-3/5" />
      <Skeleton className="h-6 w-1/3" />
    </div>
    <div className={styles.loadingGrid} aria-hidden="true">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  </LoadingState>;
}