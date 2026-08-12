"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

type BackButtonProps = {
  href?: string | null;
  label?: string;
};

function getSafeHref(href: string | null | undefined) {
  if (!href?.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

export function BackButton({ href, label = "戻る" }: BackButtonProps) {
  const router = useRouter();
  const safeHref = getSafeHref(href);

  return (
    <button
      type="button"
      onClick={() => {
        if (safeHref) {
          router.push(safeHref);
          return;
        }

        router.back();
      }}
      className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:border-connect-ink/45 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
