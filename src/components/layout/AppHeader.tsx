"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, CloudDownload, History, Search } from "lucide-react";
import type { CurrentUser } from "@/server/auth/session";
import { UserMenu } from "./UserMenu";

/** Cabeçalho no estilo do hub de automação (identidade visual compartilhada). */
export function AppHeader({ user }: { user: CurrentUser }) {
  const router = useRouter();

  return (
    <header className="flex h-16 items-center gap-4 border-b border-black/[0.07] bg-background px-4 sm:px-6">
      <div className="flex shrink-0 items-center gap-3">
        <Link href="#">
          <Image
            src="/brand/hub-logo.png"
            alt="Hub"
            width={1698}
            height={492}
            className="h-9 w-auto"
            priority
          />
        </Link>

        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-[34px] items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13.6px] font-medium text-[#374151] transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-[18px]" />
          Voltar
        </button>

        <div className="hidden sm:block">
          <p className="text-[9.92px] font-extrabold uppercase leading-none tracking-[0.08em] text-[#8a97ab]">
            Planejamento
          </p>
          <p className="mt-1 text-[16px] font-extrabold leading-none tracking-tight text-[#20324a]">
            Indicadores de Obra
          </p>
        </div>
      </div>

      <label className="relative mx-auto hidden w-[480px] max-w-full shrink items-center sm:flex">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar"
          className="h-10 w-full rounded-full bg-white pl-10 pr-4 text-[15px] text-foreground shadow-[0_2px_4px_rgba(15,23,42,0.12)] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Notificações"
          className="flex size-[38px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-[18px]" />
        </button>

        {user.role === "ADMIN" ? (
          <Link
            href="/dashboard/auditoria"
            className="flex h-[34px] items-center gap-1.5 rounded-[4px] bg-primary/10 px-3.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <History className="size-[15px]" />
            Registro de Atividades
          </Link>
        ) : null}

        <button
          type="button"
          aria-label="Exportar dados"
          className="flex size-[38px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CloudDownload className="size-[18px]" />
        </button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
