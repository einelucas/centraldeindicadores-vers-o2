"use client";

import { IdpView } from "@/features/idp/components/IdpView";

/** Compatibilidade com pontos antigos que ainda importem IdpImporter. */
export function IdpImporter() {
  return <IdpView canPublish={false} canClear={false} />;
}
