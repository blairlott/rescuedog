import { type ReactNode } from "react";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SortableTile {
  id: string;
  span: 3 | 4 | 6 | 12;
  badge: string;
  title: string;
  badgeClass: string;
  body: ReactNode;
}

interface Props {
  tiles: SortableTile[];
  onReorder: (next: string[]) => void;
  onRemove?: (id: string) => void;
  readOnly?: boolean;
}

export function SortableTileGrid({ tiles, onReorder, onRemove, readOnly }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tiles.map(t => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tiles.map(t => t.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
          {tiles.map(t => <Cell key={t.id} tile={t} onRemove={onRemove} readOnly={readOnly} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Cell({ tile, onRemove, readOnly }: { tile: SortableTile; onRemove?: (id: string) => void; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id, disabled: readOnly });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const colClass = tile.span === 12 ? "lg:col-span-12" : tile.span === 6 ? "lg:col-span-6" : tile.span === 4 ? "lg:col-span-4" : "lg:col-span-3";
  return (
    <div ref={setNodeRef} style={style} className={`group border border-border bg-card p-4 hover:border-foreground/40 transition-colors flex flex-col ${colClass}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0 flex-1">
          <div className={`inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-brand mb-1 ${tile.badgeClass}`}>{tile.badge}</div>
          <h3 className="font-bold leading-tight truncate">{tile.title}</h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!readOnly && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          {!readOnly && onRemove && (
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemove(tile.id)} title="Remove tile">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">{tile.body}</div>
    </div>
  );
}
