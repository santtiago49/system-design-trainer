"use client";

import { createContext, useContext } from "react";
import type { DesignNodeData } from "@/lib/simulate";

export type DesignActions = {
  users: number;
  setUsers: (users: number) => void;
  updateNode: (id: string, patch: Partial<DesignNodeData>) => void;
  deleteNode: (id: string) => void;
};

export const DesignActionsContext = createContext<DesignActions | null>(null);

export function useDesignActions(): DesignActions {
  const actions = useContext(DesignActionsContext);
  if (!actions) throw new Error("useDesignActions must be used inside DesignActionsContext");
  return actions;
}
