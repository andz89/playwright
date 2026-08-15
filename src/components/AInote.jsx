import React, { useId, useState } from "react";

const AInote = ({
  value = undefined,
  onChange = undefined,
  placeholder = "AI will write it's observation",
}) => {
  const [internalValue, setInternalValue] = useState("");
  const note = value ?? internalValue;
  const id = useId();

  const trimmed = note.trim();
  const isCorrect = trimmed.length > 0 && trimmed.toUpperCase() === "CORRECT";
  const isFlagged = trimmed.length > 0 && !isCorrect;
  const stateClasses = isCorrect
    ? "border-green-300 bg-green-50 text-green-900 hover:border-green-400 focus:border-green-500 focus:bg-green-50 focus:ring-green-200 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200 dark:hover:border-green-700"
    : isFlagged
      ? "border-red-300 bg-red-50 text-red-900 hover:border-red-400 focus:border-red-500 focus:bg-red-50 focus:ring-red-200 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:border-red-700"
      : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-indigo-100";

  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value);
    } else {
      setInternalValue(e.target.value);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"
      >
        <svg
          className="h-3 w-3 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        AI Note
      </label>

      {/* Grid trick: the invisible ::after clone forces the row (and the textarea in it)
          to grow with the content — no scroll, no manual JS height math. */}
      <div
        data-value={`${note} `}
        className="
          grid w-full min-h-[64px]
          after:invisible after:col-start-1 after:row-start-1
          after:whitespace-pre-wrap after:break-words
          after:px-2.5 after:py-1.5 after:text-sm after:leading-snug
          after:content-[attr(data-value)]
        "
      >
        <textarea
          id={id}
          name="ai-note"
          value={note}
          onChange={handleChange}
          placeholder={placeholder}
          className={`
            col-start-1 row-start-1 h-full w-full resize-none overflow-hidden
            rounded-md border
            px-2.5 py-1.5 text-sm leading-snug
            placeholder:italic placeholder:text-slate-400
            shadow-inner transition-colors duration-150
            focus:outline-none focus:ring-2
            ${stateClasses}
          `}
        />
      </div>
    </div>
  );
};

export default AInote;
