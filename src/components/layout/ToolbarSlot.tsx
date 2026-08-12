"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface SlotContextValue {
  node: HTMLDivElement | null;
  setNode: (el: HTMLDivElement | null) => void;
}

const ToolbarSlotContext = createContext<SlotContextValue | null>(null);

/**
 * TabsNav (barra de ícones dos módulos, no shell global) e ModuleWorkspace
 * (alternador "Painel/Administração", por página) vivem em pontos separados
 * da árvore — não dá pra passar props direto entre os dois. Esse contexto +
 * portal deixa o ModuleWorkspace injetar seus botões dentro do mesmo
 * container visual do TabsNav, sem acoplar os componentes.
 */
export function ToolbarSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  return (
    <ToolbarSlotContext.Provider value={{ node, setNode }}>{children}</ToolbarSlotContext.Provider>
  );
}

/** Renderizado dentro do container de ícones — é o encaixe onde o conteúdo por página aparece. */
export function ToolbarSlotOutlet({ className }: { className?: string }) {
  const ctx = useContext(ToolbarSlotContext);
  return <div className={className} ref={ctx?.setNode} />;
}

/** Usado pela página para colocar conteúdo dentro do encaixe acima. */
export function ToolbarSlotContent({ children }: { children: ReactNode }) {
  const ctx = useContext(ToolbarSlotContext);
  if (!ctx?.node) return null;
  return createPortal(children, ctx.node);
}
