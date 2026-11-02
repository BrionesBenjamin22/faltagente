"use client";
import { useState, type ReactNode } from "react";
import { useSports } from "@/features/sports/hooks";
import { LocationCombobox } from "@/features/locations/location-combobox";
import { errorMessage } from "@/lib/http";
import { localDate, validLocalDate } from "./discovery-state";
import type { MatchFilters } from "./service";
import styles from "./discovery-filters.module.css";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.chip} aria-pressed={selected} onClick={onClick}>{children}</button>;
}
export function DiscoveryFilters({ filters, locationId, authenticated, onFilters, onLocation, showClear = true }: {
  filters: MatchFilters; locationId: string; authenticated: boolean;
  onFilters: (filters: MatchFilters) => void; onLocation: (location: string) => void;
  showClear?: boolean;
}) {
  const sports = useSports();
  // Anchor the opened picker to its date so external clears and history restore presets.
  const [customDate, setCustomDate] = useState<string | null>(null);
  const sport = sports.data?.find(item => item.id === filters.sportId);
  const today = localDate(); const tomorrow = localDate(1);
  const customOpen = customDate !== null && customDate === (filters.date ?? "");
  const choosingDate = customOpen || !!(filters.date && filters.date !== today && filters.date !== tomorrow);
  return <section className={styles.controls} aria-label="Filtrar partidos">
    <div className={styles.group}>
      <span id="sport-label" className={styles.label}>¿Qué querés jugar?</span>
      <div className={styles.chips} role="group" aria-labelledby="sport-label">
        <Chip selected={!filters.sportId} onClick={() => onFilters({ ...filters, sportId: undefined, sportFormatId: undefined })}>Todos los deportes</Chip>
        {sports.data?.map(item => <Chip key={item.id} selected={filters.sportId === item.id} onClick={() => onFilters({ ...filters, sportId: item.id, sportFormatId: undefined })}>{item.name}</Chip>)}
      </div>
      {sports.isPending ? <p role="status" className="muted">Cargando deportes…</p> : null}
      {sports.isError ? <><p className="error" role="alert">{errorMessage(sports.error)}</p><button type="button" className="button secondary" onClick={() => void sports.refetch()}>Reintentar deportes</button></> : null}
      {sports.data?.length === 0 ? <p className="muted">No hay deportes disponibles para filtrar.</p> : null}
    </div>
    <div className={styles.locality}>
      <LocationCombobox id="home-location" label="Localidad seleccionada" value={locationId} onChange={onLocation} />
      {authenticated ? <p className={styles.help}>Explorá otra zona sin cambiar tu localidad principal.</p> : null}
    </div>
    {sport?.formats.length ? <div className={styles.group}>
      <span id="format-label" className={styles.label}>Formato</span>
      <div className={styles.chips} role="group" aria-labelledby="format-label">
        <Chip selected={!filters.sportFormatId} onClick={() => onFilters({ ...filters, sportFormatId: undefined })}>Todos los formatos</Chip>
        {sport.formats.map(format => <Chip key={format.id} selected={filters.sportFormatId === format.id} onClick={() => onFilters({ ...filters, sportFormatId: format.id })}>{format.name}</Chip>)}
      </div>
    </div> : null}
    <div className={styles.group}>
      <div className={styles.chips} role="group" aria-label="Fecha">
        <Chip selected={!filters.date && !customOpen} onClick={() => { setCustomDate(null); onFilters({ ...filters, date: undefined }); }}>Todas las fechas</Chip>
        <Chip selected={filters.date === today && !customOpen} onClick={() => { setCustomDate(null); onFilters({ ...filters, date: today }); }}>Hoy</Chip>
        <Chip selected={filters.date === tomorrow && !customOpen} onClick={() => { setCustomDate(null); onFilters({ ...filters, date: tomorrow }); }}>Mañana</Chip>
        <Chip selected={choosingDate} onClick={() => setCustomDate(filters.date ?? "")}>Elegir fecha</Chip>
      </div>
      {choosingDate || (showClear && (filters.sportId || filters.date)) ? <div className={styles.dateDetails}>
        {choosingDate ? <div className={styles.dateInput}><label htmlFor="match-date">Fecha del partido</label><input id="match-date" type="date" value={filters.date ?? ""} onChange={event => { const value = event.target.value; if (!value || validLocalDate(value)) { setCustomDate(null); onFilters({ ...filters, date: value || undefined }); } }} /></div> : null}
        {showClear && (filters.sportId || filters.date) ? <button type="button" className={`button secondary ${styles.clear}`} onClick={() => { setCustomDate(null); onFilters({}); }}>Limpiar filtros</button> : null}
      </div> : null}
    </div>
  </section>;
}
