import { useEffect, useRef, useState, type SyntheticEvent } from "react";

export function useLifecycleDisclosure(active: boolean) {
  const [open, setOpen] = useState(active);
  const previousActive = useRef(active);

  useEffect(() => {
    if (active !== previousActive.current) setOpen(active);
    previousActive.current = active;
  }, [active]);

  return {
    open,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      setOpen(event.currentTarget.open);
    },
  };
}
