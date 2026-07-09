import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./client";

const DataRootContext = createContext<string>("");

export function DataRootProvider({ children }: { children: ReactNode }) {
  const [dataRoot, setDataRoot] = useState("");

  useEffect(() => {
    api
      .getConfig()
      .then((config) => setDataRoot(config.data_root))
      .catch(() => undefined);
  }, []);

  return <DataRootContext.Provider value={dataRoot}>{children}</DataRootContext.Provider>;
}

export function useDataRoot(): string {
  return useContext(DataRootContext);
}
