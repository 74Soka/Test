"use client";

import { useState, type ComponentProps } from "react";
import { Champ } from "./ui";

/**
 * Champ « mot de passe » avec un petit œil à droite : on appuie pour voir ce
 * qu'on a tapé, on appuie encore pour le cacher.
 */
export function ChampMotDePasse(props: Omit<ComponentProps<typeof Champ>, "type" | "suffixe">) {
  const [visible, setVisible] = useState(false);
  return (
    <Champ
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffixe={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-stone-500 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-marque-600 focus-visible:outline-none"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      }
    />
  );
}
