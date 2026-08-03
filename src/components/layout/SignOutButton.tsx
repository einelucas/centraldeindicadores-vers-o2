"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/server/auth/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      className="btn"
      style={{ background: "#fff", color: "var(--azul)" }}
      type="button"
      onClick={async () => {
        await signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
