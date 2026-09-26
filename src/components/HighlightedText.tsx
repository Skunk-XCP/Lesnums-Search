import { Fragment, type ReactNode } from "react";

export function HighlightedText({ value }: { value: string }) {
  const parts = value.split(/(<mark>|<\/mark>)/g);
  const output: ReactNode[] = [];
  let isHighlighted = false;

  parts.forEach((part, index) => {
    if (part === "<mark>") {
      isHighlighted = true;
      return;
    }
    if (part === "</mark>") {
      isHighlighted = false;
      return;
    }
    if (!part) return;

    output.push(
      isHighlighted ? (
        <mark key={index} className="rounded bg-amber-200 px-0.5 text-inherit">
          {part}
        </mark>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
  });

  return output;
}
