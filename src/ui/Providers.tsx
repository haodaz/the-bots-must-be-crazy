"use client";

import type { ReactNode } from "react";
import { LangProvider } from "@/i18n.tsx";

export default function Providers({ children }: { children: ReactNode }) {
  return <LangProvider>{children}</LangProvider>;
}
