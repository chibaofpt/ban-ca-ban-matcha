import React from "react";

export function SectionLabel({ text }: { text: string }) {
  return (
    <h3 className="mb-3 ml-2 border-l-2 border-primary pl-2 text-sm font-bold uppercase tracking-wide text-primary/75">
      {text}
    </h3>
  );
}
