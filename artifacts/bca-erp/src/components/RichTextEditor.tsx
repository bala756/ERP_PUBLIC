import React, { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Bold, Italic, List, ListOrdered, Underline as UnderlineIcon, Link2, Eraser } from "lucide-react";

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h1", "h2", "h3", "span"];
const ALLOWED_ATTR = ["href", "target", "rel"];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style", "onclick", "onerror", "onload"],
  });
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
  testId?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minRows = 6, testId }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>(value);

  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastValueRef.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = sanitizeHtml(value || "");
      lastValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (ref.current && !ref.current.innerHTML) {
      ref.current.innerHTML = sanitizeHtml(value || "");
      lastValueRef.current = value;
    }
  }, []);

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (ref.current) {
      const cleaned = sanitizeHtml(ref.current.innerHTML);
      lastValueRef.current = cleaned;
      onChange(cleaned);
    }
  };

  const handleInput = () => {
    if (!ref.current) return;
    const cleaned = sanitizeHtml(ref.current.innerHTML);
    lastValueRef.current = cleaned;
    onChange(cleaned);
  };

  const handleLink = () => {
    const url = window.prompt("Enter URL", "https://");
    if (url && url.trim()) exec("createLink", url.trim());
  };

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b p-1.5 bg-muted/40">
        <ToolbarBtn label="Bold" onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Italic" onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Underline" onClick={() => exec("underline")}><UnderlineIcon className="h-3.5 w-3.5" /></ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn label="Bulleted list" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn label="Link" onClick={handleLink}><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Clear formatting" onClick={() => exec("removeFormat")}><Eraser className="h-3.5 w-3.5" /></ToolbarBtn>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={handleInput}
        onBlur={handleInput}
        data-testid={testId}
        data-placeholder={placeholder}
        className="prose prose-sm max-w-none p-3 text-sm focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        style={{ minHeight: `${minRows * 1.5}rem` }}
        suppressContentEditableWarning
      />
    </div>
  );
}

function ToolbarBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-background border border-transparent hover:border-border text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function RichTextView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || "") }}
    />
  );
}
