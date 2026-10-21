// Navigation principale entre les deux espaces de l'application.
import type { ReactNode } from 'react';
import { HospitalIcon, PillIcon } from './icons.tsx';

export type Space = 'pharmacies' | 'sante';

export function SpaceTabs({ space, onChange }: { space: Space; onChange: (s: Space) => void }) {
  const tabs: { id: Space; label: string; icon: ReactNode }[] = [
    { id: 'pharmacies', label: 'Pharmacies de garde', icon: <PillIcon size={18} /> },
    { id: 'sante', label: 'Cliniques et hôpitaux', icon: <HospitalIcon size={18} /> },
  ];
  return (
    <nav aria-label="Espaces" className="sticky top-0 z-[800] border-b border-line bg-white/95 shadow-[0_1px_6px_rgba(13,26,20,0.06)] backdrop-blur">
      <div role="tablist" className="grid grid-cols-2 lg:flex lg:px-6">
        {tabs.map((t) => {
          const on = t.id === space;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`espace-${t.id}`}
              onClick={() => onChange(t.id)}
              className={`inline-flex items-center justify-center gap-2 border-b-[3px] px-3 py-3 text-sm font-extrabold transition-colors lg:px-5 ${on ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-brand-700'}`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
