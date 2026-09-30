export function HighlightedText({ value }: { value: string }) {
  return value.replace(/<\/?mark>/g, "");
}
