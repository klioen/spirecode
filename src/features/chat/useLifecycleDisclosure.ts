import { useState, type SyntheticEvent } from "react";

export function useLifecycleDisclosure() {
  const [open, setOpen] = useState(false);

  return {
    open,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      setOpen(event.currentTarget.open);
    },
  };
}
