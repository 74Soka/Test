"use server";

import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { notifierClient } from "@/lib/notifications";

export async function envoyerNotificationTest(
  clientId: string,
): Promise<{ ok: true; telephones: number } | { ok: false; erreur: string }> {
  await exigerAdmin();
  if (!z.uuid().safeParse(clientId).success) return { ok: false, erreur: "Client introuvable." };
  try {
    const telephones = await notifierClient(clientId, {
      titre: "🔔 Frais et Français",
      corps: "Les notifications de livraison fonctionnent sur ce téléphone.",
      url: "/espace",
      tag: "test",
    });
    return { ok: true, telephones };
  } catch (e) {
    console.error("Notification de test :", e);
    return { ok: false, erreur: "La notification n'a pas pu partir. Réessayez dans un instant." };
  }
}
