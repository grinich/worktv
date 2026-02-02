"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EditableTitleProps {
  recordingId: string;
  originalTitle: string;
  customTitle?: string;
  className?: string;
}

export function EditableTitle({
  recordingId,
  originalTitle,
  customTitle,
  className,
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(customTitle ?? originalTitle);
  const [currentCustomTitle, setCurrentCustomTitle] = useState(customTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayTitle = currentCustomTitle ?? originalTitle;
  const hasCustomTitle = currentCustomTitle !== undefined && currentCustomTitle !== null;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      const trimmedTitle = newTitle.trim();

      // If empty or same as original, treat as revert
      const customTitleToSave =
        trimmedTitle === "" || trimmedTitle === originalTitle
          ? null
          : trimmedTitle;

      setIsSaving(true);
      try {
        const response = await fetch(
          `/api/recordings/${encodeURIComponent(recordingId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customTitle: customTitleToSave }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        setCurrentCustomTitle(customTitleToSave ?? undefined);
        setTitle(customTitleToSave ?? originalTitle);
      } catch (error) {
        // Revert on error
        setTitle(displayTitle);
        console.error("Failed to save title:", error);
      } finally {
        setIsSaving(false);
        setIsEditing(false);
      }
    },
    [recordingId, originalTitle, displayTitle]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle(title);
    } else if (e.key === "Escape") {
      setTitle(displayTitle);
      setIsEditing(false);
    }
  };

  const handleRevert = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await saveTitle(originalTitle);
  };

  // Filter out 'truncate' from className for the input since it clips text
  const inputClassName = className?.replace(/\btruncate\b/g, "").trim();

  if (isEditing) {
    return (
      <div className="flex items-center justify-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => saveTitle(title)}
          disabled={isSaving}
          className={`${inputClassName} bg-transparent rounded-md px-2 py-1 border border-indigo-500 outline-none text-center`}
          style={{ width: `${Math.max(title.length + 2, 20)}ch` }}
        />
        {hasCustomTitle && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleRevert(e);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition px-2 py-0.5 rounded border border-zinc-600 hover:border-zinc-400"
            title={`Revert to "${originalTitle}"`}
          >
            Revert
          </button>
        )}
      </div>
    );
  }

  return (
    <h1
      onClick={() => setIsEditing(true)}
      className={`${className} cursor-text rounded-md px-2 py-1 -mx-2 -my-1 transition border border-transparent hover:border-zinc-600 hover:bg-zinc-800/50 light:hover:border-zinc-300 light:hover:bg-zinc-100/50`}
      title="Click to edit title"
    >
      {displayTitle}
    </h1>
  );
}
