import { useState } from "react";
import "./App.css";
import Header from "./components/Header";
import SideBar from "./components/sideBar";

type Section = "Resumen" | "Análisis" | "Historia" | "Actividades";

function App() {
  const [selected, setSelected] = useState<Section>("Resumen");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="flex">
        <SideBar selected={selected} onSelect={setSelected} />
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-bold">Contenido principal</h1>
        </main>
      </div>
    </div>
  );
}

export default App;
