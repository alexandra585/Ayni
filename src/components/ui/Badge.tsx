import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type Tone = "paid" | "pending" | "late" | "locked" | "neutral";

export function Badge({ tone, icon, children, className, style }: { tone: Tone; icon?: IconName; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn("badge", `b-${tone}`, className)} style={style}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}
