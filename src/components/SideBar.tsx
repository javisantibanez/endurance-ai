import { Button } from "./ui/button";
import { NotebookText, ChartLine, History, Dumbbell } from "lucide-react";

type Section = "Resumen" | "Análisis" | "Historia" | "Actividades";

type SideBarProps = {
  selected: Section;
  onSelect: (section: Section) => void;
};

const items: { label: Section; icon: React.ElementType }[] = [
  { label: "Resumen", icon: NotebookText },
  { label: "Análisis", icon: ChartLine },
  { label: "Historia", icon: History },
  { label: "Actividades", icon: Dumbbell },
];

export default function SideBar({ selected, onSelect }: SideBarProps) {
  return (
    <aside className="w-64 min-h-[calc(100vh-88px)] border-r bg-background p-4">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-amber-600">
        Navegación
      </h2>

      <nav className="flex flex-col gap-2">
        {items.map(({ label, icon: Icon }) => (
          <Button
            key={label}
            variant={selected === label ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            onClick={() => onSelect(label)}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Button>
        ))}
      </nav>
    </aside>
  );
}
