import Image from "next/image";
import { Bell, Search } from "lucide-react";
import type { CurrentUser } from "@/server/auth/session";
import { UserMenu } from "./UserMenu";

/** Cabeçalho no estilo do hub corporativo (identidade visual compartilhada). */
export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <Image
          src="/brand/logo-inpasa.png"
          alt="Inpasa"
          width={2087}
          height={601}
          className="h-[30px] w-auto"
          priority
        />
        <div className="hidden sm:block">
          <p className="text-[10px] font-bold uppercase leading-none tracking-wider text-muted-foreground">
            Planejamento
          </p>
          <p className="mt-1 text-[15px] font-extrabold leading-none tracking-tight text-foreground">
            Central de Indicadores
          </p>
        </div>
      </div>

      <label className="relative mx-auto hidden w-full max-w-md items-center sm:flex">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar"
          className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background"
        />
      </label>

      <div className="flex items-center gap-1.5 justify-self-end">
        <button
          type="button"
          aria-label="Notificações"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-[18px]" />
        </button>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <UserMenu user={user} />
      </div>
    </header>
  );
}
