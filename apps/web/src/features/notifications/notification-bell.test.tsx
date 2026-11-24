import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";

const state = vi.hoisted(() => ({ unreadCount: 12 }));
vi.mock("./hooks", () => ({
  useUnreadNotificationCount: () => ({ data: { unreadCount: state.unreadCount } }),
}));

describe("NotificationBell", () => {
  beforeEach(() => { state.unreadCount = 12; });
  it("shows a 9+ badge and navigates to the center", () => {
    render(<NotificationBell authenticated />);
    expect(screen.getByRole("link", { name: /12 notificaciones no leídas/i })).toHaveAttribute("href", "/notificaciones");
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("does not show a badge at zero", () => {
    state.unreadCount = 0;
    render(<NotificationBell authenticated />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
