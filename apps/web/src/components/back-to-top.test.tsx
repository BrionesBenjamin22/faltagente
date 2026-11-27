import Link from "next/link";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BackToTop } from "./back-to-top";

const route = vi.hoisted(() => ({ pathname: "/partidos" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

beforeEach(() => {
  route.pathname = "/partidos";
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function scrollTo(y: number) {
  vi.stubGlobal("scrollY", y);
  fireEvent.scroll(window);
}

it("appears at one viewport, updates on resize, and hides again at the top", () => {
  render(<BackToTop />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  scrollTo(799);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  scrollTo(800);
  expect(screen.getByRole("button", { name: "Volver arriba" })).toBeInTheDocument();
  vi.stubGlobal("innerHeight", 900);
  fireEvent.resize(window);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  scrollTo(950);
  scrollTo(0);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([false, true])("respects reduced motion (%s) and restores keyboard focus to the brand", (reducedMotion) => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reducedMotion } as MediaQueryList);
  render(<><Link id="site-brand" href="/">Falta Gente</Link><BackToTop /></>);
  scrollTo(900);
  const button = screen.getByRole("button", { name: "Volver arriba" });
  button.focus();
  fireEvent.click(button, { detail: 0 });
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  expect(screen.getByRole("link")).toHaveFocus();
});

it("preserves pointer focus rather than moving it to the brand", () => {
  render(<><Link id="site-brand" href="/">Falta Gente</Link><BackToTop /></>);
  scrollTo(900);
  const button = screen.getByRole("button");
  button.focus();
  fireEvent.click(button, { detail: 1 });
  expect(button).toHaveFocus();
});

it("rechecks restored scroll on navigation and removes listeners on unmount", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  const cancel = vi.spyOn(window, "cancelAnimationFrame");
  const view = render(<BackToTop />);
  scrollTo(900);
  route.pathname = "/account/appearance";
  vi.stubGlobal("scrollY", 0);
  view.rerender(<BackToTop />);
  act(() => frames.at(-1)!(0));
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  view.unmount();
  const scrollListener = add.mock.calls.find(([event]) => event === "scroll")![1];
  expect(add).toHaveBeenCalledWith("scroll", scrollListener, { passive: true });
  expect(remove).toHaveBeenCalledWith("scroll", scrollListener);
  expect(remove.mock.calls.filter(([event]) => event === "resize")).toHaveLength(2);
  expect(cancel).toHaveBeenCalledTimes(2);
});
