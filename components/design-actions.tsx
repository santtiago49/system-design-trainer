"use client";

import { createContext, useContext } from "react";
import type { DesignNodeData } from "@/lib/simulate";
import type { TextData } from "./annotations";

export type DesignActions = {
  users: number;
  // Levels fix the number of users; only free play lets you change it.
  usersLocked: boolean;
  setUsers: (users: number) => void;
  updateNode: (id: string, patch: Partial<DesignNodeData>) => void;
  updateAnnotation: (id: string, patch: Partial<TextData>) => void;
  deleteNode: (id: string) => void;
};

export const DesignActionsContext = createContext<DesignActions | null>(null);

export function useDesignActions(): DesignActions {
  const actions = useContext(DesignActionsContext);
  if (!actions) throw new Error("useDesignActions must be used inside DesignActionsContext");
  return actions;
}
