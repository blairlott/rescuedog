import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import type { SlotField, SlotSchema } from "./slotSchemas";

interface Props {
  schema: SlotSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function SlotFieldsForm({ schema, value, onChange }: Props) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      {schema.fields.map((f) => (
        <FieldRow key={f.key} field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} />
      ))}
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: SlotField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "bool") {
    return (
      <div className="flex items-center justify-between border border-border p-3">
        <div>
          <Label className="text-sm">{field.label}</Label>
          {field.help && <p className="text-xs text-muted-foreground mt-1">{field.help}</p>}
        </div>
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <Label className="text-sm">{field.label}</Label>
        {field.help && <p className="text-xs text-muted-foreground mb-1">{field.help}</p>}
        <Select value={(value as string) ?? ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Pick one…" /></SelectTrigger>
          <SelectContent>
            {field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "multi") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const remaining = field.options.filter((o) => !arr.includes(o.value));
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    };
    return (
      <div>
        <Label className="text-sm">{field.label}</Label>
        {field.help && <p className="text-xs text-muted-foreground mb-1">{field.help}</p>}
        <div className="space-y-1">
          {arr.map((v, i) => {
            const opt = field.options.find((o) => o.value === v);
            return (
              <div key={v} className="flex items-center justify-between border border-border px-3 py-2 text-sm">
                <span>{i + 1}. {opt?.label ?? v}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-3 w-3" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === arr.length - 1} aria-label="Move down"><ArrowDown className="h-3 w-3" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(arr.filter((x) => x !== v))} aria-label="Remove"><X className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
        {remaining.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {remaining.map((o) => (
              <Badge key={o.value} variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => onChange([...arr, o.value])}>
                + {o.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (field.type === "longtext") {
    return (
      <div>
        <Label className="text-sm">{field.label}</Label>
        {field.help && <p className="text-xs text-muted-foreground mb-1">{field.help}</p>}
        <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />
      </div>
    );
  }

  // text / url / image
  return (
    <div>
      <Label className="text-sm">{field.label}</Label>
      {field.help && <p className="text-xs text-muted-foreground mb-1">{field.help}</p>}
      <Input
        type={field.type === "url" ? "url" : "text"}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "image" ? "https://…" : ""}
      />
      {field.type === "image" && typeof value === "string" && value.trim() !== "" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="mt-2 h-20 w-32 object-cover border border-border" />
      )}
    </div>
  );
}