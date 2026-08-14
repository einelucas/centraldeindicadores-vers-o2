"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings2 } from "lucide-react";
import { signOut } from "@/server/auth/client";
import type { CurrentUser } from "@/server/auth/session";

const ROLE_LABELS: Record<CurrentUser["role"], string> = {
  VIEWER: "Visualizador",
  ANALYST: "Analista",
  ADMIN: "Administrador",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 pl-0.5 transition-colors hover:bg-muted"
      >
        <span className="relative flex size-10 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
          {initials(user.name)}
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-success" />
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-bold text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>

          <div className="my-1 h-px bg-border" />

          {user.role === "ADMIN" ? (
            <Link
              href="/dashboard/administracao"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings2 className="size-4 text-muted-foreground" />
              Administração
            </Link>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
