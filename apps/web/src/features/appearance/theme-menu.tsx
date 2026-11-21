"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme";
import styles from "./theme-menu.module.css";

const options = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const;

function isThemePreference(value: string): value is ThemePreference {
  return options.some((option) => option.value === value);
}

export function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  const current = options.find((option) => option.value === preference)!;
  const Icon = current.Icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.trigger} aria-label={`Cambiar tema: ${current.label}`}>
          <Icon size={22} aria-hidden="true" data-theme-icon={preference} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={`${styles.menu} glass`} align="end" sideOffset={8} collisionPadding={12} aria-label="Tema">
          <DropdownMenu.RadioGroup value={preference} onValueChange={(value) => {
            if (isThemePreference(value)) setPreference(value);
          }}>
            {options.map(({ value, label, Icon: OptionIcon }) => (
              <DropdownMenu.RadioItem className={styles.option} key={value} value={value}>
                <OptionIcon size={18} aria-hidden="true" />
                <span>{label}</span>
                <DropdownMenu.ItemIndicator className={styles.indicator}>
                  <Check size={16} aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
