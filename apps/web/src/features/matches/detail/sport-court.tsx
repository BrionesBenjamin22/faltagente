import type { SVGProps } from "react";

/** Decorative SVGs: deliberately defined in the codebase, without external images or assets. */
export type SportVariant = "futbol" | "basquet" | "padel" | "voley";

export function getSportVariant(slug: string): SportVariant {
  if (slug === "basquet" || slug === "padel" || slug === "voley") return slug;
  return "futbol";
}

export function SportIcon({ sport, ...props }: { sport: SportVariant } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {sport === "futbol" ? <><circle cx="12" cy="12" r="9.5" /><path d="m12 6 4 3-1.4 4.7H9.4L8 9zM12 6V2.5M16 9l4-1.2m-5.4 5.9 3.5 4M9.4 13.7l-3.5 4M8 9 4 7.8M12 18.5l-4.1 3M12 18.5l4.1 3" /></> : null}
    {sport === "basquet" ? <><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5v19M5.7 5.4C11.4 7.5 14 12 14.5 20.5M18.3 5.4C12.6 7.5 10 12 9.5 20.5"/></> : null}
    {sport === "padel" ? <><rect x="4.3" y="2.5" width="12.5" height="14.2" rx="6.2" transform="rotate(-16 10.5 9.6)"/><path d="m12.6 15.6 4.7 6.1 2.1-1.5-4.7-6.1M6.6 7l7.3-2M6.2 11l8.3-2.4M7 14l6.8-2M9.7 4.2l3.6 10.3"/><circle cx="19.7" cy="5.3" r="2.3" fill="currentColor" stroke="none"/></> : null}
    {sport === "voley" ? <><circle cx="12" cy="12" r="9.5"/><path d="M12 2.5c-3.7 3.5-4.2 7.3-2.6 10M4.2 6.5c4.6-.5 8.5 1.2 10.3 4.6M2.5 13.6c3.7-2.1 7.5-1.5 10.4.6M11.6 21.5c-.8-4.1.6-7.8 3.9-10.7m6 2.1c-3.8-1.5-7.3-.5-10.2 2.8M17.3 4c.8 3.5-.5 6.6-3 9"/></> : null}
  </svg>;
}

export function SportCourt({ sport, ...props }: { sport: SportVariant } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 370 250" fill="none" role="img" aria-label={`Ilustración de cancha de ${sport === "futbol" ? "fútbol" : sport === "basquet" ? "básquet" : sport === "padel" ? "pádel" : "vóley"}`} {...props}>
    {sport === "futbol" ? <>
      <rect x="13" y="13" width="344" height="224" rx="17" fill="#1b593b" stroke="#68a781" strokeWidth="2"/>
      <g opacity=".10" fill="#b0e4ad"><rect x="16" y="15" width="57" height="220"/><rect x="131" y="15" width="57" height="220"/><rect x="246" y="15" width="57" height="220"/></g>
      <g fill="none" stroke="#d1f5d2" strokeOpacity=".72" strokeWidth="2.2">
      <rect x="32" y="31" width="306" height="186" rx="4"/><path d="M185 31v186"/><circle cx="185" cy="124" r="36"/>
      <rect x="32" y="70" width="53" height="108" rx="1"/><rect x="285" y="70" width="53" height="108" rx="1"/>
      <rect x="32" y="95" width="23" height="59"/><rect x="315" y="95" width="23" height="59"/><path d="M27 108h5v32h-5M343 108h-5v32h5"/>
      </g><circle cx="185" cy="124" r="3" fill="#e6f7db"/>
      <g className="sport-players"><g fill="#d5fa80"><circle cx="81" cy="123" r="7"/><circle cx="142" cy="70" r="7"/><circle cx="144" cy="175" r="7"/><circle cx="108" cy="125" r="7"/></g><g fill="#e6f7db"><circle cx="288" cy="124" r="7"/><circle cx="226" cy="78" r="7"/><circle cx="226" cy="169" r="7"/><circle cx="261" cy="126" r="7"/></g></g>
    </> : null}
    {sport === "basquet" ? <>
      <rect x="13" y="13" width="344" height="224" rx="17" fill="#b96e37" stroke="#d59b68" strokeWidth="2"/>
      <g opacity=".15" stroke="#f8d8a3" strokeWidth="2"><path d="M56 15v220M105 15v220M155 15v220M205 15v220M255 15v220M305 15v220"/></g>
      <rect x="31" y="31" width="308" height="186" rx="3" stroke="#fff1d6" strokeWidth="2.4" fill="none"/>
      <g stroke="#fff1d6" strokeWidth="2.3" fill="none"><path d="M185 31v186"/><circle cx="185" cy="124" r="35"/><rect x="31" y="78" width="66" height="92"/><rect x="273" y="78" width="66" height="92"/><path d="M31 88 A58 58 0 0 1 31 160M339 88 A58 58 0 0 0 339 160"/><path d="M97 92 A32 32 0 0 1 97 156 M273 92 A32 32 0 0 0 273 156" strokeDasharray="3 4"/><circle cx="54" cy="124" r="6"/><circle cx="316" cy="124" r="6"/></g>
      <g stroke="#fff1d6" strokeWidth="2"><path d="M25 111v26M345 111v26"/><path d="M25 124h8M337 124h8"/></g>
      <g className="sport-players"><g fill="#c9fc7b"><circle cx="109" cy="87" r="7"/><circle cx="109" cy="163" r="7"/><circle cx="143" cy="124" r="7"/></g><g fill="#fff1db"><circle cx="263" cy="87" r="7"/><circle cx="263" cy="163" r="7"/><circle cx="227" cy="124" r="7"/></g></g>
    </> : null}
    {sport === "padel" ? <>
      <rect x="13" y="13" width="344" height="224" rx="17" fill="#214e4a" stroke="#7ac7a8" strokeWidth="2"/>
      <g fill="none"><rect x="24" y="23" width="322" height="204" rx="9" stroke="#9ee3cf" strokeOpacity=".52" strokeWidth="3"/><rect x="31" y="30" width="308" height="190" rx="3" stroke="#e7fff3" strokeOpacity=".92" strokeWidth="2.5"/>
      <path d="M108 30v190M262 30v190M31 124h308" stroke="#e7fff3" strokeWidth="2.4"/><path d="M185 30v190" stroke="#f9fff8" strokeWidth="3.7"/></g>
      <g stroke="#b7f3d6" strokeOpacity=".36" strokeWidth="1"><path d="M178 30v190M192 30v190M180 48h10M180 65h10M180 82h10M180 99h10M180 116h10M180 133h10M180 150h10M180 167h10M180 184h10M180 201h10"/></g>
      <g stroke="#f2fff8" strokeOpacity=".55"><path d="M21 24v202M349 24v202" strokeDasharray="7 5"/></g>
      <g className="sport-players"><g fill="#caff7e"><circle cx="116" cy="65" r="8"/><circle cx="116" cy="187" r="8"/></g><g fill="#f1fff5"><circle cx="260" cy="65" r="8"/><circle cx="260" cy="187" r="8"/></g><circle cx="174" cy="117" r="4" fill="#fff7a1"/></g>
    </> : null}
    {sport === "voley" ? <>
      <rect x="13" y="13" width="344" height="224" rx="17" fill="#9d5f40" stroke="#d29a78" strokeWidth="2"/>
      <g opacity=".16" stroke="#e8bd9b" strokeWidth="2"><path d="M35 17v216M80 17v216M125 17v216M170 17v216M215 17v216M260 17v216M305 17v216"/></g>
      <rect x="45" y="38" width="280" height="172" rx="2" fill="#c57a51" stroke="#ffe9d1" strokeWidth="2.5"/>
      <rect x="113" y="38" width="144" height="172" fill="#df9a6d" fillOpacity=".6"/>
      <g stroke="#fff2df" strokeWidth="2.4" fill="none"><path d="M185 38v172M45 38h280v172H45z"/><path d="M112 38v172M258 38v172"/></g>
      <path d="M185 26v196" stroke="#fffbe9" strokeWidth="3.5"/>
      <g stroke="#fffbe9" strokeOpacity=".5" strokeWidth="1.3"><path d="M185 38h1M185 50h1M185 62h1M185 74h1M185 86h1M185 98h1M185 110h1M185 122h1M185 134h1M185 146h1M185 158h1M185 170h1M185 182h1M185 194h1M185 206h1"/></g>
      <g stroke="#f8d5a4" strokeWidth="2"><path d="M182 24v201M188 24v201" strokeOpacity=".3"/></g>
      <g className="sport-players"><g fill="#d0fd83"><circle cx="75" cy="77" r="8"/><circle cx="75" cy="171" r="8"/><circle cx="149" cy="84" r="8"/><circle cx="149" cy="164" r="8"/></g><g fill="#f6f8e9"><circle cx="294" cy="77" r="8"/><circle cx="294" cy="171" r="8"/><circle cx="218" cy="84" r="8"/><circle cx="218" cy="164" r="8"/></g><circle cx="185" cy="70" r="5" fill="#fff3b3"/></g>
    </> : null}

  </svg>;
}
