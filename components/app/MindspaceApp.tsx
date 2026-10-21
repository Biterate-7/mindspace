"use client";

import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { CreateScreen } from "@/components/create/CreateScreen";
import { DiscoverScreen } from "@/components/discovery/DiscoverScreen";
import { Toasts } from "@/components/ui/Toasts";
import { Workspace } from "@/components/workspace/Workspace";
import { useMindspace } from "@/lib/store";

/**
 * Root of the client app. Storage is only readable in the browser, so the server
 * renders an empty midnight frame and the real view appears once local data is read.
 */
export function MindspaceApp() {
  const view = useMindspace((s) => s.view);
  const createOpen = useMindspace((s) => s.createOpen);
  const discoverOpen = useMindspace((s) => s.discoverOpen);
  const init = useMindspace((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      {view === "workspace" && <Workspace />}
      <AnimatePresence>{(view === "create" || (view === "workspace" && createOpen)) && <CreateScreen key="create" overlay={view === "workspace"} />}</AnimatePresence>
      <AnimatePresence>{(view === "discover" || (view === "workspace" && discoverOpen)) && <DiscoverScreen key="discover" overlay={view === "workspace"} />}</AnimatePresence>
      <Toasts />
    </>
  );
}
