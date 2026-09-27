"use client";

import { useEffect, useRef, useState } from "react";
import type { Node, NodeProps, XYPosition } from "@xyflow/react";
import { nanoid } from "nanoid";
import { useDesignActions } from "./design-actions";

// Whiteboard annotations: plain React Flow nodes so they pan, zoom and persist
// with the design, but they have no handles and the capacity model ignores them.

export type LineData = { from: XYPosition; to: XYPosition };
export type LineNode = Node<LineData, "line">;

export type TextData = { text: string; isNew?: boolean };
export type TextNode = Node<TextData, "text">;

// Padding around a line's bounding box so the stroke isn't clipped.
const PAD = 8;

export function createLine(start: XYPosition, end: XYPosition): LineNode {
  const x = Math.min(start.x, end.x) - PAD;
  const y = Math.min(start.y, end.y) - PAD;
  return {
    id: nanoid(8),
    type: "line",
    position: { x, y },
    data: { from: { x: start.x - x, y: start.y - y }, to: { x: end.x - x, y: end.y - y } },
  };
}

export function createText(position: XYPosition): TextNode {
  return { id: nanoid(8), type: "text", position, data: { text: "", isNew: true }, selected: true };
}

export function LineNodeView({ data, selected }: NodeProps<LineNode>) {
  const { from, to } = data;
  const width = Math.max(from.x, to.x) + PAD;
  const height = Math.max(from.y, to.y) + PAD;
  return (
    // Only the stroke is clickable, so the empty part of the bounding box doesn't block the canvas.
    <svg width={width} height={height} className="pointer-events-none overflow-visible">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={14} className="pointer-events-auto cursor-pointer" />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={selected ? "#6d5bd0" : "#52525b"}
        strokeWidth={2}
        strokeLinecap="round"
        className="pointer-events-none"
      />
    </svg>
  );
}

export function TextNodeView({ id, data, selected }: NodeProps<TextNode>) {
  const { updateAnnotation, deleteNode } = useDesignActions();
  const [editing, setEditing] = useState(!!data.isNew);
  const [value, setValue] = useState(data.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // React Flow keeps a node hidden until it has been measured, and hidden
  // elements can't take focus, so keep trying for a few frames.
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    let tries = 0;
    const focus = () => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (document.activeElement !== el && tries++ < 20) frame = requestAnimationFrame(focus);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const finish = () => {
    setEditing(false);
    if (!value.trim()) deleteNode(id);
    else updateAnnotation(id, { text: value, isNew: false });
  };

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={value}
        placeholder="Type a note"
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
        }}
        className="nodrag nowheel field-sizing-content min-w-40 resize-none rounded-md bg-white/80 px-1.5 py-1 text-base text-ink outline outline-2 outline-[#6d5bd0]"
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      className={`max-w-md whitespace-pre-wrap rounded-md px-1.5 py-1 text-base text-ink ${selected ? "outline outline-2 outline-[#6d5bd0]" : ""}`}
    >
      {data.text}
    </div>
  );
}
