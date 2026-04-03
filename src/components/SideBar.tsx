import { Button } from "./ui/button";

type Section = "Resumen" | "Análisis" | "Historia" | "Actividades";

type SideBarProps = {
  selected: Section;
  onSelect: (section: Section) => void;
};

const items: Section[] = ["Resumen", "Análisis", "Historia", "Actividades"];

export default function SideBar({ selected, onSelect }: SideBarProps) {
  return (
    <aside className="w-64 min-h-[calc(100vh-88px)] border-r bg-background p-4">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted-foreground">
        Navegación
      </h2>

      <nav className="flex flex-col gap-2">
        {items.map((item) => (
          <Button
            key={item}
            variant={selected === item ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onSelect(item)}
          >
            {item}
          </Button>
        ))}
      </nav>
    </aside>
  );
}
