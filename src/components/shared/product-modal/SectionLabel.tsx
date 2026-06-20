import React from "react";

export function SectionLabel({ text }: { text: string }) {
  return (
    <h3 className="font-bold text-sm text-primary uppercase tracking-wide opacity-50 mb-3 ml-2 border-l-2 border-primary pl-2">
      {text}
    </h3>
  );
}
