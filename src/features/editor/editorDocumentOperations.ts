const activeSaves = new Map<string, Promise<void>>();
const blockedDocuments = new Map<string, number>();

export function isEditorDocumentBlocked(resourceId: string): boolean {
  return (blockedDocuments.get(resourceId) ?? 0) > 0;
}

export function trackEditorDocumentSave(
  resourceId: string,
  operation: Promise<void>,
): Promise<void> {
  activeSaves.set(resourceId, operation);
  void operation.then(
    () => {
      if (activeSaves.get(resourceId) === operation)
        activeSaves.delete(resourceId);
    },
    () => {
      if (activeSaves.get(resourceId) === operation)
        activeSaves.delete(resourceId);
    },
  );
  return operation;
}

export async function blockEditorDocuments(
  resourceIds: readonly string[],
): Promise<() => void> {
  const unique = [...new Set(resourceIds)];
  for (const id of unique)
    blockedDocuments.set(id, (blockedDocuments.get(id) ?? 0) + 1);
  await Promise.allSettled(
    unique.map((id) => activeSaves.get(id)).filter(Boolean),
  );
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const id of unique) {
      const remaining = (blockedDocuments.get(id) ?? 1) - 1;
      if (remaining > 0) blockedDocuments.set(id, remaining);
      else blockedDocuments.delete(id);
    }
  };
}

export function clearEditorDocumentOperations(): void {
  activeSaves.clear();
  blockedDocuments.clear();
}
