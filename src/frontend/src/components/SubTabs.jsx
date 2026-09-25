import { NavLink } from "react-router-dom";

export default function SubTabs({ tabs }) {
  return (
    <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2 px-4 pt-4">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-sm ${
              isActive ? "bg-masa-600 text-white" : "bg-white text-masa-700 border border-masa-200"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
