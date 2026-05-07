import logo from "../assets/logo.png";

export default function Header() {
  return (
    <>
      <header className="flex items-center gap-3 p-6 text-black shadow-lg">
        <img src={logo} alt="Endurance-AI Logo" className="w-12 h-12" />
        <h1 className="font-sans text-4xl font-bold left-0 text-amber-600">
          Endurance-AI
        </h1>
      </header>
    </>
  );
}
