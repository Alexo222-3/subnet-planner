// The app shell: a header and two tabs. Each tab is its own component.
// Both tabs stay mounted (just hidden) so switching tabs doesn't lose what you typed.
import { useState } from "react";
import Planner from "./Planner";
import Calculator from "./Calculator";

export default function App() {
  const [tab, setTab] = useState<"planner" | "calculator">("planner");

  return (
    <main>
      <h1 className="no-print">Subnet Planner</h1>
      <nav className="no-print">
        <button className={tab === "planner" ? "active" : ""} onClick={() => setTab("planner")}>
          Network planner
        </button>
        <button className={tab === "calculator" ? "active" : ""} onClick={() => setTab("calculator")}>
          Subnet calculator
        </button>
      </nav>
      <div hidden={tab !== "planner"}>
        <Planner />
      </div>
      <div hidden={tab !== "calculator"}>
        <Calculator />
      </div>
    </main>
  );
}
