const STORAGE_KEY = "spirecode.projects.expanded-groups.v1";

export const loadExpandedProjectGroupIds = (): Set<string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored) || stored.some((id) => typeof id !== "string"))
      return new Set();
    return new Set(stored);
  } catch {
    return new Set();
  }
};

export const persistExpandedProjectGroupIds = (groupIds: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...groupIds]));
  } catch {
    return;
  }
};
