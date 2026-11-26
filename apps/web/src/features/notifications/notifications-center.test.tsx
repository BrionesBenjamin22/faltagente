import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsCenter } from "./notifications-center";

vi.mock("@/features/auth/session", () => ({
  useSession: () => ({ isPending: false, isError: false, session: { authenticated: true, user: { id: "user-1" } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, isError: false, mutate: vi.fn(), error: null }),
  useInfiniteQuery: () => ({
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    data: {
      pages: [{
        unreadCount: 1,
        items: [{
          id: "notification-1",
          type: "MATCH_JOINED",
          title: "Alguien se sumó",
          body: "Juan reservó 2 lugares",
          detail: null,
          relatedMatchId: "match-1",
          metadata: {},
          isRead: false,
          readAt: null,
          createdAt: "2026-11-24T11:55:00Z",
          actorUser: { id: "player-1", name: "Juan" },
          relatedMatch: null,
        }],
      }],
    },
  }),
}));

describe("NotificationsCenter", () => {
  it("renders filters, unread content and delete action", () => {
    render(<NotificationsCenter />);
    expect(screen.getByRole("heading", { name: "Notificaciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "No leídas" })).toBeInTheDocument();
    expect(screen.getByText("Alguien se sumó")).toBeInTheDocument();
    expect(screen.getByText("Juan reservó 2 lugares")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar notificación: Alguien se sumó" })).toBeInTheDocument();
  });
});
