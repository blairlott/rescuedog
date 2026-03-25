import { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, X } from "lucide-react";

interface Props {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string | null) => void;
}

export function EditableSelect({ value, options, placeholder = "Assign", onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleSelect = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setInputValue("");
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setTimeout(() => inputRef.current?.focus(), 50); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-7 w-[130px] text-xs justify-between px-2 font-normal">
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-2 space-y-1" align="start">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search or add..."
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim()) {
              handleSelect(inputValue.trim());
            }
          }}
        />
        <div className="max-h-[150px] overflow-y-auto space-y-0.5">
          <button
            type="button"
            className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted flex items-center gap-1 text-muted-foreground"
            onClick={() => handleSelect(null)}
          >
            <X className="h-3 w-3" /> None
          </button>
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted ${name === value ? "bg-muted font-medium" : ""}`}
              onClick={() => handleSelect(name)}
            >
              {name}
            </button>
          ))}
          {inputValue.trim() && !filtered.some((f) => f.toLowerCase() === inputValue.trim().toLowerCase()) && (
            <button
              type="button"
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-primary font-medium"
              onClick={() => handleSelect(inputValue.trim())}
            >
              + Add "{inputValue.trim()}"
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
