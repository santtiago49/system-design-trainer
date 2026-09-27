"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadProgress, type Progress } from "@/lib/progress";
import { loadWorkspace, SANDBOX, selectWorkspace, type Workspace } from "@/lib/workspace";
import { LevelSelect } from "./level-select";

export function LevelsPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ stars: {} });
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
    const workspace = loadWorkspace();
    setCurrent(workspace?.kind === "level" ? workspace.levelId : null);
  }, []);

  const open = (workspace: Workspace) => {
    selectWorkspace(workspace);
    router.push("/");
  };

  return (
    <LevelSelect
      progress={progress}
      currentLevelId={current}
      onPlay={(levelId) => open({ kind: "level", levelId })}
      onFreePlay={() => open(SANDBOX)}
    />
  );
}
